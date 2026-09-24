import {updateJourney, openSampleEnd} from './journey.js?v=10';
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['book','stage','reader-layout','sidebar','drawer-backdrop','masthead','reading-area','contents-toggle','close-contents','view-toggle','zoom-out','zoom-in','zoom-reset','fullscreen-toggle','previous','next','page-form','page-number','spread-end','page-progress','current-section','reading-hint','loading-note','error-panel','error-description','retry','announcer'].map(id => [id,$(id)]));
const TOTAL = 10;
const PAGE_WIDTH = 1866, PAGE_HEIGHT = 2953;
const pendingLoads = new Set();
const STORAGE = 'craft-demo-reader-2676a3c9c706';
const desktop = matchMedia('(min-width:900px)');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
const toc = [...document.querySelectorAll('[data-page]')];
let bookReady = false, revision = 0, resizeTimer;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch {}
const validPage = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= TOTAL ? Number(value) : null;
const hashPage = () => validPage(new URLSearchParams(location.hash.slice(1)).get('page'));
let page = hashPage() || validPage(saved.page) || 1;
let zoom = 1, preferSpread = true, sidebarOpen = desktop.matches, lastRenderKey = '';
const isSpread = () => desktop.matches && preferSpread;
const firstPage = () => isSpread() ? Math.floor((page - 1) / 2) * 2 + 1 : page;
const visiblePages = () => Array.from({length: isSpread() ? Math.min(2,TOTAL-firstPage()+1) : 1}, (_,i) => firstPage()+i);
const announce = text => { els.announcer.textContent = text; };

function savePosition() {
  try { localStorage.setItem(STORAGE, JSON.stringify({page})); } catch {}
}

function updateControls({preservePageInput = false} = {}) {
  const pages = visiblePages(), first = pages[0], last = pages.at(-1);
  if (!preservePageInput || document.activeElement !== els['page-number']) els['page-number'].value = String(first);
  els['spread-end'].textContent = last !== first ? `–${last}` : '';
  els['page-progress'].value = first;
  els['page-progress'].setAttribute('aria-valuetext', `Страница ${first} из ${TOTAL}`);
  els['previous'].disabled = !bookReady || first <= 1;
  els['next'].disabled = !bookReady;
  els['previous'].setAttribute('aria-label', isSpread() ? 'Предыдущий разворот' : 'Предыдущая страница');
  els['next'].setAttribute('aria-label', last === TOTAL ? 'Завершить фрагмент' : isSpread() ? 'Следующий разворот' : 'Следующая страница');
  els['zoom-out'].disabled = !bookReady || zoom <= .75;
  els['zoom-in'].disabled = !bookReady || zoom >= 3;
  els['zoom-reset'].disabled = !bookReady;
  els['zoom-reset'].textContent = `${Math.round(zoom*100)}%`;
  els['view-toggle'].disabled = !bookReady;
  els['view-toggle'].setAttribute('aria-pressed', String(isSpread()));
  els['page-number'].disabled = els['page-progress'].disabled = !bookReady;
  els.stage.classList.toggle('is-zoomed',zoom > 1);
  let active = null;
  for (const link of toc) if (Number(link.dataset.page) <= page) active = link;
  for (const link of toc) {
    const selected = link === active;
    link.classList.toggle('is-current', selected);
    if (selected) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
  }
  const title = 'Как придумать живой бренд';
  els['current-section'].textContent = title;
  els['reading-hint'].textContent = last === TOTAL ? 'Конец фрагмента. Спасибо за чтение.' : desktop.matches ? 'Листайте стрелками на клавиатуре' : zoom > 1 ? 'Двигайте страницу, чтобы рассмотреть детали' : 'Листайте свайпом или стрелками';
  updateJourney({page, atEnd:last === TOTAL && bookReady});
  document.title = `${first}${last !== first ? `–${last}` : ''} / ${TOTAL} — Фиолетовый CRAFT`;
}

function setSidebar(open, focus = false) {
  sidebarOpen = open;
  els.sidebar.hidden = !open;
  els['reader-layout'].classList.toggle('sidebar-open',open);
  els['contents-toggle'].setAttribute('aria-expanded',String(open));
  const modal = open && !desktop.matches;
  els['drawer-backdrop'].hidden = !modal;
  els.masthead.inert = modal;
  els['reading-area'].inert = modal;
  if (modal) { els.sidebar.setAttribute('role','dialog'); els.sidebar.setAttribute('aria-modal','true'); }
  else { els.sidebar.removeAttribute('role'); els.sidebar.removeAttribute('aria-modal'); }
  if (focus && open) els['close-contents'].focus();
  if (focus && !open) els['contents-toggle'].focus();
}

function cancelRender() {
  for (const cancel of [...pendingLoads]) cancel();
}

function showError(error) {
  els.stage.setAttribute('aria-busy','false');
  els.stage.classList.remove('is-rendering');
  els['loading-note'].hidden = true;
  els['error-panel'].hidden = false;
  els['error-description'].textContent = location.protocol === 'file:'
    ? 'Откройте читалку через локальный сервер или воспользуйтесь ссылкой на PDF.'
    : 'Не удалось открыть страницы. Попробуйте ещё раз или откройте оригинальный PDF.';
  announce('Книга не загрузилась. Можно повторить загрузку или открыть PDF.');
  console.error('CRAFT reader:', error);
}

// The source PDF is already raster-only. Lossless, pre-rendered portrait pages
// avoid decoding its large spreads in PDF.js on the reader's device.
function loadPage(number) {
  return new Promise((resolve,reject) => {
    const img = new Image(PAGE_WIDTH,PAGE_HEIGHT);
    img.alt = '';
    img.decoding = 'sync';
    const finish = () => { clearTimeout(timer); pendingLoads.delete(cancel); img.onload = img.onerror = null; };
    const cancel = () => { finish(); img.src = ''; reject(new DOMException('Cancelled','AbortError')); };
    const timer = setTimeout(() => { finish(); img.src = ''; reject(new Error('Page download timeout')); },90000);
    pendingLoads.add(cancel);
    img.onload = () => { finish(); resolve(img); };
    img.onerror = () => { finish(); reject(new Error('Page download failed')); };
    img.src = new URL('assets/pages/2676a3c9c706/page-' + number + '.webp',import.meta.url).href;
  });
}

async function render({resetScroll = false,motion = false} = {}) {
  if (!bookReady) return;
  const ticket = ++revision;
  cancelRender();
  els.stage.setAttribute('aria-busy','true');
  els.stage.classList.add('is-rendering');
  els.stage.classList.toggle('is-empty',!els.book.children.length);
  els['error-panel'].hidden = true;
  const pages = visiblePages();
  try {
    const mat = getComputedStyle(document.querySelector('.book-mat'));
    const width = Math.max(1,els.stage.clientWidth-parseFloat(mat.paddingLeft)-parseFloat(mat.paddingRight));
    const height = Math.max(1,els.stage.clientHeight-parseFloat(mat.paddingTop)-parseFloat(mat.paddingBottom));
    const widthFit = width/(PAGE_WIDTH*pages.length);
    const fit = Math.min(widthFit,height/PAGE_HEIGHT);
    const scale = fit*zoom;
    const key = pages.join(',') + ':' + scale.toFixed(6);
    if (key !== lastRenderKey || !els.book.children.length) {
      const images = await Promise.all(pages.map(loadPage));
      if (ticket !== revision) return;
      const fragment = document.createDocumentFragment();
      pages.forEach((number,index) => {
        const article = document.createElement('article');
        article.className = 'pdf-page';
        article.dataset.page = number;
        article.setAttribute('aria-label',`Страница фрагмента ${number} из ${TOTAL}`);
        article.style.width = PAGE_WIDTH*scale + 'px';
        article.style.height = PAGE_HEIGHT*scale + 'px';
        article.append(images[index]);
        fragment.append(article);
      });
      els.book.replaceChildren(fragment);
      lastRenderKey = key;
    }
    els['loading-note'].hidden = true;
    els.stage.classList.remove('is-rendering','is-empty');
    els.stage.setAttribute('aria-busy','false');
    if (resetScroll) { els.stage.scrollTop = 0; els.stage.scrollLeft = 0; }
    if (motion && !reducedMotion.matches) els.book.animate([{clipPath:'inset(0 0 0 3%)'},{clipPath:'inset(0 0 0 0)'}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
    announce(`Страниц${pages.length > 1 ? 'ы' : 'а'} ${pages.join('–')} из ${TOTAL}. ${els['current-section'].textContent}.`);
  } catch(error) {
    if (ticket !== revision || error.name === 'AbortError') return;
    cancelRender();
    lastRenderKey = '';
    showError(error);
  }
}

function navigate(value,{history = true} = {}) {
  const target = validPage(value);
  if (!target) { els['page-number'].setCustomValidity(`Введите номер от 1 до ${TOTAL}`); els['page-number'].reportValidity(); return; }
  const changed = target !== page;
  page = target;
  if (history && hashPage() !== page) window.history.pushState({craftReaderPage:page},'',`#page=${page}`);
  savePosition();
  updateControls();
  render({resetScroll:changed,motion:changed});
}
function turn(direction) {
  const pages = visiblePages();
  const target = direction > 0 ? pages.at(-1)+1 : pages[0]-(isSpread() ? 2 : 1);
  if (direction > 0 && target > TOTAL) {openSampleEnd();return;}
  if (target >= 1 && target <= TOTAL) navigate(target);
}
function setZoom(value) {
  zoom = Math.max(.75,Math.min(3,Math.round(value*100)/100));
  updateControls();
  render({resetScroll:zoom === 1});
}

function loadBook() {
  bookReady = true;
  updateControls();
  render();
}

els['contents-toggle'].addEventListener('click',() => setSidebar(!sidebarOpen,true));
els['close-contents'].addEventListener('click',() => setSidebar(false,true));
els['drawer-backdrop'].addEventListener('click',() => setSidebar(false,true));
toc.forEach(link => link.addEventListener('click',event => {
  event.preventDefault();
  navigate(Number(link.dataset.page));
  if (!desktop.matches) setSidebar(false,true);
}));
els.previous.addEventListener('click',() => turn(-1));
els.next.addEventListener('click',() => turn(1));
els['zoom-in'].addEventListener('click',() => setZoom(zoom+.25));
els['zoom-out'].addEventListener('click',() => setZoom(zoom-.25));
els['zoom-reset'].addEventListener('click',() => setZoom(1));
els['view-toggle'].addEventListener('click',() => {preferSpread = !preferSpread;updateControls();render({resetScroll:true});});
els['page-number'].addEventListener('input',() => els['page-number'].setCustomValidity(''));
els['page-form'].addEventListener('submit',event => {event.preventDefault();navigate(Number(els['page-number'].value));els['page-number'].blur();});
els['page-progress'].addEventListener('input',() => els['page-progress'].setAttribute('aria-valuetext',`Страница ${els['page-progress'].value} из ${TOTAL}`));
els['page-progress'].addEventListener('change',() => navigate(Number(els['page-progress'].value)));
els.retry.addEventListener('click',() => render());
window.addEventListener('hashchange',() => {const target = hashPage();if (target && target !== page) navigate(target,{history:false});});
window.addEventListener('popstate',event => {
  const target = hashPage() || validPage(event.state?.craftReaderPage);
  if (target && target !== page) navigate(target,{history:false});
});

els['fullscreen-toggle'].hidden = !document.fullscreenEnabled;
els['fullscreen-toggle'].addEventListener('click',async() => {
  try {if (document.fullscreenElement) await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch {announce('Полноэкранный режим недоступен в этом браузере.');}
});
document.addEventListener('fullscreenchange',() => {
  const label = document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'На весь экран';
  els['fullscreen-toggle'].setAttribute('aria-label',label);
  els['fullscreen-toggle'].title = label;
});

document.addEventListener('keydown',event => {
  if (document.querySelector('dialog[open]')) return;
  if (sidebarOpen && !desktop.matches) {
    if (event.key === 'Escape') {event.preventDefault();setSidebar(false,true);}
    if (event.key === 'Tab') {
      const focusable = [...els.sidebar.querySelectorAll('a,button')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    }
    return;
  }
  if (event.target.closest('input,textarea,select,[contenteditable=true]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (getSelection()?.toString()) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (zoom > 1 && event.target === els.stage) return;
    event.preventDefault();turn(event.key === 'ArrowLeft' ? -1 : 1);
  }
  if (event.key === 'Home') {event.preventDefault();navigate(1);}
  if (event.key === 'End') {event.preventDefault();navigate(TOTAL);}
  if (event.key === 'Escape' && zoom !== 1) setZoom(1);
});
let touch = null;
els.stage.addEventListener('touchstart',event => {
  touch = event.touches.length === 1 && zoom <= 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY,time:Date.now()} : null;
},{passive:true});
els.stage.addEventListener('touchmove',event => {if(event.touches.length !== 1) touch = null;},{passive:true});
els.stage.addEventListener('touchcancel',() => {touch = null;},{passive:true});
els.stage.addEventListener('touchend',event => {
  if (!touch || !event.changedTouches.length || getSelection()?.toString()) {touch = null;return;}
  const end = event.changedTouches[0], dx = end.clientX-touch.x, dy = end.clientY-touch.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)*1.8 && Date.now()-touch.time < 650) turn(dx < 0 ? 1 : -1);
  touch = null;
},{passive:true});

new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {updateControls({preservePageInput:true});render();},120);
}).observe(els.stage);
desktop.addEventListener('change',() => {setSidebar(desktop.matches);updateControls({preservePageInput:true});render({resetScroll:true});});
window.addEventListener('pagehide',() => {savePosition();cancelRender();});
window.addEventListener('pageshow',event => {if (event.persisted) render();});
setSidebar(sidebarOpen);
window.history.replaceState({...window.history.state,craftReaderPage:page},'',location.href);
updateControls();
loadBook();
