const $ = id => document.getElementById(id);
const dialog = $('app-dialog');
const saveButton = $('save-offline');
const status = $('offline-status');
const progress = $('offline-progress');
const embedded = window.top !== window.self;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Use the reader's own address, including inside Tilda; omit page state and query parameters.
const directUrl = new URL('./', import.meta.url).href;
// Explicit user-activated handoff; Telegram itself uses this scheme for Safari.
// Safari/iOS may decline it, so manual copying always remains available.
const safariUrl = directUrl.startsWith('https://') ? directUrl.replace(/^https:/, 'x-safari-https:') : null;
$('direct-app').href = directUrl;
$('reader-url').value = directUrl;
if (safariUrl) $('open-safari').href = safariUrl;
else {
  $('safari-fallback').open = true;
  $('safari-fallback-title').textContent = 'Как открыть ссылку в Safari';
}
let installPrompt, registration, registering, saving = false, readyOffline = false;

function renderInstall() {
  $('install-app').hidden = !installPrompt || standalone() || embedded;
  $('direct-app').hidden = !embedded || ios;
  $('safari-guide').hidden = !ios || standalone();
  $('open-safari').hidden = !ios || standalone() || !safariUrl;
  $('safari-guide-title').textContent = embedded ? 'Как перейти в Safari' : 'Открыли в Telegram?';
  if (standalone()) {
    $('install-help').textContent = 'Читалка открыта как приложение. Сохраните фрагмент ниже, чтобы читать его без интернета.';
  } else if (ios) {
    $('install-help').textContent = embedded
      ? 'В Safari: «Поделиться» → «На экран „Домой“» → «Добавить».'
      : 'В Safari нажмите «Поделиться» → «На экран „Домой“» → «Добавить». Затем откройте CRAFT с главного экрана.';
  } else if (embedded) {
    $('install-help').textContent = 'Для установки и офлайн-чтения откройте читалку отдельной страницей в браузере.';
  } else {
    $('install-help').textContent = installPrompt
      ? 'Установите CRAFT, чтобы открывать книгу с главного экрана.'
      : 'В Chrome или Edge откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран». Название пункта зависит от браузера.';
  }
}

$('copy-reader-url').addEventListener('click', async () => {
  const button = $('copy-reader-url');
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(directUrl);
    $('manual-reader-url').hidden = true;
    $('copy-status').textContent = 'Ссылка скопирована. Откройте Safari и вставьте её в адресную строку.';
  } catch {
    $('manual-reader-url').hidden = false;
    $('copy-status').textContent = 'Автоматически скопировать не удалось. Нажмите и удерживайте ссылку ниже, затем выберите «Скопировать».';
    $('reader-url').focus();
    $('reader-url').select();
  } finally {
    button.disabled = false;
  }
});

function callWorker(type, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = registration?.active;
    if (!worker) return reject(new Error('Читалка ещё готовится. Попробуйте через несколько секунд.'));
    const channel = new MessageChannel();
    let timer;
    const close = () => { clearTimeout(timer); channel.port1.close(); };
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { close(); reject(new Error('Сохранение прервалось. Проверьте соединение и повторите.')); }, 45000);
    };
    channel.port1.onmessage = ({data}) => {
      resetTimer();
      if (data.type === 'progress') { onProgress?.(data); return; }
      close();
      if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    resetTimer();
    worker.postMessage({type}, [channel.port2]);
  });
}

async function prepareWorker() {
  if (registration?.active) return registration;
  if (registering) return registering;
  registering = (async () => {
    const candidate = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
    if (!candidate.active) {
      await new Promise((resolve, reject) => {
        const worker = candidate.installing || candidate.waiting;
        const timer = setTimeout(() => { cleanup(); reject(new Error('Не удалось подготовить офлайн-чтение. Проверьте соединение.')); }, 20000);
        const cleanup = () => { clearTimeout(timer); worker?.removeEventListener('statechange', check); };
        const check = () => {
          if (candidate.active) { cleanup(); resolve(); }
          else if (!worker || worker.state === 'redundant') { cleanup(); reject(new Error('Не удалось загрузить читалку для офлайн-режима. Повторите попытку.')); }
        };
        worker?.addEventListener('statechange', check);
        check();
      });
    }
    registration = candidate;
    return candidate;
  })().finally(() => { registering = null; });
  return registering;
}

async function updateStatus() {
  if (saving) return;
  if (embedded) {
    status.textContent = 'Сохранение доступно в отдельно открытой читалке.';
    saveButton.hidden = true;
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Этот браузер не поддерживает офлайн-чтение. Откройте ссылку в Safari, Chrome или Edge.';
    saveButton.disabled = true;
    return;
  }
  try {
    await prepareWorker();
    const result = await callWorker('OFFLINE_STATUS');
    readyOffline = result.ready;
    status.textContent = readyOffline
      ? 'Сохранено · все 44 страницы доступны без интернета.'
      : navigator.onLine ? 'Фрагмент ещё не сохранён на этом устройстве.' : 'Подключитесь к интернету, чтобы сохранить фрагмент.';
    saveButton.textContent = readyOffline ? 'Фрагмент сохранён' : 'Сохранить для офлайн-чтения';
    saveButton.disabled = readyOffline || !navigator.onLine;
  } catch (error) {
    status.textContent = error.message;
    saveButton.textContent = 'Повторить сохранение';
    saveButton.disabled = !navigator.onLine;
  }
}

$('open-app').addEventListener('click', () => {
  renderInstall();
  dialog.showModal();
  updateStatus();
});
$('close-app').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => $('open-app').focus());
$('install-app').addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  try { await prompt.prompt(); await prompt.userChoice; } catch { /* Browser menu remains available. */ }
  renderInstall();
});
saveButton.addEventListener('click', async () => {
  if (saving || readyOffline) return;
  saving = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Сохраняем…';
  progress.hidden = false;
  progress.value = 0;
  status.textContent = 'Сохраняем книгу и читалку. Оставьте страницу открытой.';
  try {
    await prepareWorker();
    await callWorker('SAVE_OFFLINE', ({done, total}) => {
      progress.value = Math.round(done / total * 100);
      status.textContent = `Сохраняем книгу и читалку… ${progress.value}%`;
    });
    // A refusal of persistent storage must not invalidate a successful download.
    try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
    saving = false;
    progress.hidden = true;
    await updateStatus();
  } catch (error) {
    saving = false;
    progress.hidden = true;
    status.textContent = error.message;
    saveButton.textContent = 'Повторить сохранение';
    saveButton.disabled = false;
  }
});
addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; renderInstall(); });
addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); });
addEventListener('online', updateStatus);
addEventListener('offline', updateStatus);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && dialog.open) updateStatus(); });
renderInstall();
updateStatus();
