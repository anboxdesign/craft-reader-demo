/* Regenerate offline-files.js with scripts/build-craft-reader-pwa.cjs after edits. */
importScripts('./offline-files.js');
const {version, files} = self.CRAFT_OFFLINE;
const scope = new URL('./', self.location.href);
const prefix = `craft-reader:${scope.pathname}:`;
const cacheName = `${prefix}${version}`;
const urls = files.map(file => new URL(file, scope).href);
const allowed = new Set(urls);
const indexUrl = new URL('index.html', scope).href;
const shell = files.filter(file => !file.startsWith('vendor/') && !file.endsWith('.pdf'));
let saving;
const progressPorts = new Set();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell.map(file => new Request(new URL(file, scope), {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function offlineStatus() {
  const cache = await caches.open(cacheName);
  const keys = new Set((await cache.keys()).map(request => request.url));
  return {ready: urls.every(url => keys.has(url))};
}

async function saveAll() {
  const cache = await caches.open(cacheName);
  let cursor = 0, done = 0, failure;
  const worker = async () => {
    while (cursor < urls.length && !failure) {
      const url = urls[cursor++];
      try {
        if (!await cache.match(url)) {
          const response = await fetch(new Request(url, {cache: 'reload'}));
          if (!response.ok || response.status === 206) throw new Error('Incomplete asset');
          await cache.put(url, response);
        }
        done++;
        for (const port of progressPorts) port.postMessage({type: 'progress', done, total: urls.length});
      } catch (error) { failure = error; }
    }
  };
  // Bound concurrent downloads; a retry reuses successfully saved files.
  await Promise.all(Array.from({length: 6}, worker));
  if (failure) throw failure;
  const status = await offlineStatus();
  if (!status.ready) throw new Error('Incomplete cache');
  return status;
}

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || !['OFFLINE_STATUS', 'SAVE_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'OFFLINE_STATUS') { port.postMessage(await offlineStatus()); return; }
      progressPorts.add(port);
      if (!saving) saving = saveAll().finally(() => { saving = null; });
      port.postMessage(await saving);
    } catch {
      port.postMessage({error: 'Не удалось сохранить фрагмент полностью. Проверьте соединение и свободное место, затем повторите.'});
    } finally { progressPorts.delete(port); port.close(); }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate' && [scope.pathname, `${scope.pathname}index.html`].includes(url.pathname)) {
    event.respondWith((async () => {
      // Keep HTML and its versioned assets together. Worker updates install the new shell.
      return (await (await caches.open(cacheName)).match(indexUrl)) || fetch(request);
    })());
  } else if (allowed.has(url.href)) {
    // The cache contains full PDF responses; returning 200 also satisfies a range request.
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(url.href)) || fetch(request)));
  }
});
