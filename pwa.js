const $ = id => document.getElementById(id);
const dialog = $('app-dialog');
const saveButton = $('save-offline');
const status = $('offline-status');
const progress = $('offline-progress');
const embedded = window.top !== window.self;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = /Android/i.test(navigator.userAgent);
let androidMode = android || new URLSearchParams(location.search).get('install') === 'android';
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Enter through the update page, including from Tilda; forward only the book page and chosen guide.
const directUrl = new URL('./open.html', import.meta.url).href;
function currentPage() {
  const hash = new URLSearchParams(location.hash.slice(1)).get('page');
  let value = hash;
  try {if (!hash) value = JSON.parse(localStorage.getItem('craft-demo-reader-2676a3c9c706') || '{}').page;} catch {}
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10 ? Number(value) : 1;
}
function pageUrl(install) {
  const url = new URL(directUrl);
  if (install) url.searchParams.set('install',install);
  url.hash = `page=${currentPage()}`;
  return url.href;
}
function syncLinks() {
  $('direct-app').href = pageUrl(android || androidMode ? 'android' : '');
  $('android-link').href = pageUrl('android');
  $('update-reader').href = pageUrl('');
  guideUrl.hash = `page=${currentPage()}`;
  $('reader-url').value = guideUrl.href;
  if (safariUrl) $('open-safari').href = guideUrl.href.replace(/^https:/,'x-safari-https:');
}
const guideUrl = new URL(directUrl);
guideUrl.searchParams.set('install', '2');
// Explicit user-activated handoff; Telegram itself uses this scheme for Safari.
// Safari/iOS may decline it, so manual copying always remains available.
const safariUrl = directUrl.startsWith('https://') ? guideUrl.href.replace(/^https:/, 'x-safari-https:') : null;
$('direct-app').href = directUrl;
$('reader-url').value = guideUrl.href;
if (safariUrl) $('open-safari').href = safariUrl;
else {
  $('safari-fallback').open = true;
  $('safari-fallback-title').textContent = 'Как открыть ссылку в Safari';
}
let installPrompt, registration, registering, saving = false, readyOffline = false;
let guideMode = ios && !standalone(), guideStep = 0, appOpener = $('open-app');
const hintKey = 'craft-install-hint-dismissed-v1';
let hintDismissed = false;
try { hintDismissed = localStorage.getItem(hintKey) === '1'; } catch { /* Reading also works without storage. */ }
// Illustrations are decorative; retain every instruction if an image cannot load.
document.querySelectorAll('.comic-scene img').forEach(img => {
  const hideBrokenImage = () => { img.hidden = true; };
  img.addEventListener('error', hideBrokenImage);
  if (img.complete && !img.naturalWidth) hideBrokenImage();
});

function renderGuide({focus = false} = {}) {
  document.querySelectorAll('[data-guide-step]').forEach((step, index) => { step.hidden = index !== guideStep; });
  document.querySelectorAll('[data-guide-go]').forEach((button, index) => {
    if (index === guideStep) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  $('guide-back').hidden = guideStep === 0;
  $('guide-next').textContent = ['Я в Safari — дальше', 'Дальше', 'К чтению'][guideStep];
  if (focus) {
    dialog.scrollTop = 0;
    const heading = document.querySelector(`[data-guide-step="${guideStep}"] h3`);
    heading.focus({preventScroll:true});
    if (heading.getBoundingClientRect().bottom > dialog.getBoundingClientRect().bottom - 32) heading.scrollIntoView({block:'center'});
  }
}

function dismissHint() {
  hintDismissed = true;
  $('install-nudge').hidden = true;
  try { localStorage.setItem(hintKey, '1'); } catch { /* A dismissed hint stays dismissed for this visit. */ }
}

function renderInstall() {
  syncLinks();
  $('android-instructions').hidden = !androidMode || ios || standalone();
  $('show-android-guide').hidden = androidMode || ios || standalone();
  $('android-link').hidden = embedded;
  $('install-title').textContent = androidMode && !ios ? 'Установить на Android' : 'На главном экране';
  $('install-app').textContent = android ? 'Установить на Android' : 'Установить приложение';
  $('direct-app').textContent = android ? 'Открыть для Android' : 'Открыть читалку отдельно';
  $('install-app').hidden = !installPrompt || standalone() || embedded;
  $('direct-app').hidden = !embedded || ios;
  if (standalone()) guideMode = false;
  $('safari-guide').hidden = !guideMode;
  $('generic-install').hidden = guideMode || standalone();
  $('offline-section').hidden = guideMode;
  $('replay-install-guide').hidden = guideMode || android || standalone();
  $('install-nudge').hidden = !ios || standalone() || hintDismissed;
  document.querySelector('.app-intro').textContent = guideMode
    ? 'Три шага — и CRAFT на главном экране.'
    : 'Читайте фрагмент книги с главного экрана — в том числе без интернета.';
  $('open-safari').hidden = !ios || standalone() || !safariUrl;
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
  if (androidMode && !ios && !standalone()) $('install-help').textContent = embedded ? 'Откройте ссылку ниже в Chrome на телефоне, чтобы установить читалку.' : 'Читалка устанавливается на главный экран через Chrome.';
  renderGuide();
}

$('copy-reader-url').addEventListener('click', async () => {
  syncLinks();
  const button = $('copy-reader-url');
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(guideUrl.href);
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
      timer = setTimeout(() => { close(); reject(new Error('Сохранение прервалось. Проверьте соединение и повторите.')); }, 180000);
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
    const showUpdate = () => {$('update-note').hidden = !candidate.waiting || !navigator.serviceWorker.controller;};
    showUpdate();
    candidate.addEventListener('updatefound',()=>candidate.installing?.addEventListener('statechange',showUpdate));
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
      ? 'Сохранено · все 10 страниц доступны без интернета.'
      : navigator.onLine ? 'Фрагмент ещё не сохранён на этом устройстве.' : 'Подключитесь к интернету, чтобы сохранить фрагмент.';
    saveButton.textContent = readyOffline ? 'Фрагмент сохранён' : 'Сохранить для офлайн-чтения';
    saveButton.disabled = readyOffline || !navigator.onLine;
  } catch (error) {
    status.textContent = error.message;
    saveButton.textContent = 'Повторить сохранение';
    saveButton.disabled = !navigator.onLine;
  }
}

function openApp(opener = $('open-app'), step) {
  appOpener = opener;
  guideMode = (ios && !standalone()) || Number.isInteger(step);
  if (Number.isInteger(step)) guideStep = Math.max(0, Math.min(2, step));
  renderInstall();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  updateStatus();
}
$('open-app').addEventListener('click', () => openApp());
$('show-install-guide').addEventListener('click', event => openApp(event.currentTarget, 0));
$('dismiss-install-guide').addEventListener('click', () => { dismissHint(); $('open-app').focus(); });
document.querySelectorAll('[data-guide-go]').forEach(button => button.addEventListener('click', () => { guideStep = Number(button.dataset.guideGo); renderGuide({focus:true}); }));
$('guide-back').addEventListener('click', () => { guideStep = Math.max(0, guideStep - 1); renderGuide({focus:true}); });
$('guide-next').addEventListener('click', () => {
  if (guideStep === 2) { dismissHint(); dialog.close(); }
  else { guideStep++; renderGuide({focus:true}); }
});
$('show-offline-settings').addEventListener('click', () => { guideMode = false; renderInstall(); dialog.scrollTop = 0; $('offline-title').focus(); });
$('show-android-guide').addEventListener('click',()=>{androidMode=true;guideMode=false;renderInstall();dialog.scrollTop=0;});
$('replay-install-guide').addEventListener('click', () => { androidMode = false; guideMode = true; guideStep = 0; renderInstall(); renderGuide({focus:true}); });
$('close-app').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => (appOpener.getClientRects().length ? appOpener : $('open-app')).focus());
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
// Only an explicit handoff link opens the guide automatically. Ordinary visits remain readable.
if (new URLSearchParams(location.search).get('install') === '2' && !standalone()) openApp($('open-app'), 1);
if (new URLSearchParams(location.search).get('install') === 'android' && !standalone()) {openApp();guideMode=false;renderInstall();}
