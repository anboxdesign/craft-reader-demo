/* Regenerate offline-files.js with scripts/build-craft-reader-pwa-v10.cjs after edits. */
importScripts('./offline-files.js');
const {version, files, migrations} = self.CRAFT_OFFLINE;
const scope = new URL('./', self.location.href);
const prefix = `craft-reader:${scope.pathname}:`;
const cacheName = `${prefix}${version}`;
const urls = files.map(file => new URL(file, scope).href);
const allowed = new Set(urls);
const indexUrl = new URL('index.html', scope).href;
const shell = files.filter(file => !file.startsWith('vendor/') && !file.startsWith('assets/pages/') && !file.endsWith('.pdf'));
let saving;
const progressPorts = new Set();

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.map(file => new Request(new URL(file, scope), {cache: 'reload'})));
    // Preserve an already saved book; do not download it without the reader's request.
    const existing = await caches.keys();
    for (const migration of migrations) {
      const previousName = `${prefix}${migration.fromVersion}`;
      if (!existing.includes(previousName)) continue;
      const previous = await caches.open(previousName);
      for (const file of migration.files) {
        const url = new URL(file, scope).href;
        if (await cache.match(url)) continue;
        const response = await previous.match(url);
        if (response?.status === 200) await cache.put(url, response);
      }
    }
  })());
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
  if (event.data?.type === 'GET_RELEASE' && port) {port.postMessage({release:10,version});port.close();return;}
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    // Only the explicit entry/update page can activate a waiting release.
    const source = event.source?.url ? new URL(event.source.url) : null;
    if (source?.origin === scope.origin && source.pathname === scope.pathname + 'open.html') event.waitUntil(self.skipWaiting());
    return;
  }
  if (!port || !['OFFLINE_STATUS', 'SAVE_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'OFFLINE_STATUS') { port.postMessage(await offlineStatus()); return; }
      progressPorts.add(port);
      if (!saving) saving = saveAll().finally(() => { saving = null; });
      port.postMessage(await saving);
    } catch {
      port.postMessage({error: 'Не удалось сохранить фрагмент полностью. Проверьте соединение и свободное место, затем повторите.'});
    } finally { progressPorts.delete(port); port.close(); }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // A navigation may retain #page in Request.url; it is not a cache resource key.
  url.hash = '';
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
