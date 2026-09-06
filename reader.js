const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['book','stage','reader-layout','sidebar','drawer-backdrop','masthead','reading-area','contents-toggle','close-contents','view-toggle','zoom-out','zoom-in','zoom-reset','fullscreen-toggle','previous','next','page-form','page-number','spread-end','page-progress','current-section','reading-hint','loading-note','error-panel','error-description','retry','announcer'].map(id => [id,$(id)]));
const TOTAL = 44;
const PDF_URL = new URL('assets/CRAFT_test_2.pdf', import.meta.url);
const STORAGE = 'craft-demo-reader-v1';
const desktop = matchMedia('(min-width:900px)');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
const toc = [...document.querySelectorAll('[data-page]')];
let pdfjs, pdf, loadingTask, renderTasks = [], textLayers = [], revision = 0, resizeTimer, loadRevision = 0;
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

function updateControls() {
  const pages = visiblePages(), first = pages[0], last = pages.at(-1);
  els['page-number'].value = String(first);
  els['spread-end'].textContent = last !== first ? `–${last}` : '';
  els['page-progress'].value = first;
  els['page-progress'].setAttribute('aria-valuetext', `Страница ${first} из ${TOTAL}`);
  els['previous'].disabled = !pdf || first <= 1;
  els['next'].disabled = !pdf || last >= TOTAL;
  els['previous'].setAttribute('aria-label', isSpread() ? 'Предыдущий разворот' : 'Предыдущая страница');
  els['next'].setAttribute('aria-label', isSpread() ? 'Следующий разворот' : 'Следующая страница');
  els['zoom-out'].disabled = !pdf || zoom <= .75;
  els['zoom-in'].disabled = !pdf || zoom >= 3;
  els['zoom-reset'].disabled = !pdf;
  els['zoom-reset'].textContent = `${Math.round(zoom*100)}%`;
  els['view-toggle'].disabled = !pdf;
  els['view-toggle'].setAttribute('aria-pressed', String(isSpread()));
  els['page-number'].disabled = els['page-progress'].disabled = !pdf;
  els.stage.classList.toggle('is-zoomed',zoom > 1);
  let active = toc[0];
  for (const link of toc) if (Number(link.dataset.page) <= page) active = link;
  for (const link of toc) {
    const selected = link === active;
    link.classList.toggle('is-current', selected);
    if (selected) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
  }
  const title = page < 3 ? 'Привет, мы — книга' : page < 11 ? 'Введение' : 'Как придумать живой бренд';
  els['current-section'].textContent = title;
  els['reading-hint'].textContent = last === TOTAL ? 'Конец фрагмента. Спасибо за чтение.' : desktop.matches ? 'Листайте стрелками на клавиатуре' : zoom > 1 ? 'Двигайте страницу, чтобы рассмотреть детали' : 'Листайте свайпом или стрелками';
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
  renderTasks.forEach(task => task.cancel());
  textLayers.forEach(layer => layer.cancel());
  renderTasks = [];
  textLayers = [];
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

async function addLinks(pdfPage, viewport, container) {
  const annotations = await pdfPage.getAnnotations({intent:'display'});
  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link' || !annotation.rect) continue;
    const link = document.createElement('a');
    if (annotation.url && /^https?:\/\//i.test(annotation.url)) {
      link.href = annotation.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Открыть ссылку из книги в новой вкладке');
    } else if (annotation.dest) {
      let dest = annotation.dest;
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest) || !dest[0]) continue;
      const target = typeof dest[0] === 'number' ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
      if (!validPage(target)) continue;
      link.href = `#page=${target}`;
      link.setAttribute('aria-label', `Перейти на страницу ${target}`);
    } else continue;
    const rect = viewport.convertToViewportRectangle(annotation.rect);
    link.className = 'pdf-link';
    Object.assign(link.style,{left:`${Math.min(rect[0],rect[2])}px`,top:`${Math.min(rect[1],rect[3])}px`,width:`${Math.abs(rect[2]-rect[0])}px`,height:`${Math.abs(rect[3]-rect[1])}px`});
    container.append(link);
  }
}

async function render({resetScroll = false, motion = false} = {}) {
  if (!pdf) return;
  const ticket = ++revision;
  cancelRender();
  els.stage.setAttribute('aria-busy','true');
  els.stage.classList.add('is-rendering');
  els.stage.classList.toggle('is-empty',!els.book.children.length);
  els['error-panel'].hidden = true;
  const pages = visiblePages();
  try {
    const sources = await Promise.all(pages.map(number => pdf.getPage(number)));
    if (ticket !== revision) return;
    const mat = getComputedStyle(document.querySelector('.book-mat'));
    const horizontal = parseFloat(mat.paddingLeft)+parseFloat(mat.paddingRight);
    const vertical = parseFloat(mat.paddingTop)+parseFloat(mat.paddingBottom);
    const availableWidth = Math.max(100,els.stage.clientWidth-horizontal);
    const availableHeight = Math.max(100,els.stage.clientHeight-vertical);
    const base = sources[0].getViewport({scale:1});
    const widthFit = availableWidth/(base.width*pages.length);
    const fit = desktop.matches ? Math.min(widthFit,availableHeight/base.height) : widthFit;
    const scale = fit*zoom;
    const key = `${pages.join(',')}:${scale.toFixed(4)}:${window.devicePixelRatio}`;
    if (key === lastRenderKey && els.book.children.length) {
      els.stage.setAttribute('aria-busy','false');
      els.stage.classList.remove('is-rendering');
      return;
    }
    const fragment = document.createDocumentFragment();
    await Promise.all(sources.map(async (source,index) => {
      const viewport = source.getViewport({scale});
      const article = document.createElement('article');
      article.className = 'pdf-page';
      article.dataset.page = pages[index];
      article.setAttribute('aria-label',`Страница PDF ${pages[index]} из ${TOTAL}`);
      article.style.width = `${viewport.width}px`;
      article.style.height = `${viewport.height}px`;
      article.style.setProperty('--total-scale-factor',String(scale));
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden','true');
      // Bound raster memory on 4K and at maximum zoom; keep the PDF text vector-based.
      const outputScale = Math.min(window.devicePixelRatio || 1,2.5,Math.sqrt(8_000_000/(viewport.width*viewport.height)));
      canvas.width = Math.ceil(viewport.width*outputScale);
      canvas.height = Math.ceil(viewport.height*outputScale);
      article.append(canvas);
      fragment.append(article);
      const task = source.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:outputScale === 1 ? null : [outputScale,0,0,outputScale,0,0],background:'#ffffff'});
      renderTasks.push(task);
      await task.promise;
      if (ticket !== revision) return;
      const textLayerContainer = document.createElement('div');
      textLayerContainer.className = 'textLayer';
      article.append(textLayerContainer);
      const layer = new pdfjs.TextLayer({textContentSource:source.streamTextContent(),container:textLayerContainer,viewport});
      textLayers.push(layer);
      await layer.render();
      await addLinks(source,viewport,article);
    }));
    if (ticket !== revision) return;
    els.book.replaceChildren(fragment);
    lastRenderKey = key;
    els['loading-note'].hidden = true;
    els.stage.classList.remove('is-rendering','is-empty');
    els.stage.setAttribute('aria-busy','false');
    if (resetScroll) { els.stage.scrollTop = 0; els.stage.scrollLeft = 0; }
    if (motion && !reducedMotion.matches) els.book.animate([{clipPath:'inset(0 0 0 3%)'},{clipPath:'inset(0 0 0 0)'}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
    announce(`Страниц${pages.length > 1 ? 'ы' : 'а'} ${pages.join('–')} из ${TOTAL}. ${els['current-section'].textContent}.`);
  } catch(error) {
    if (ticket !== revision || error.name === 'RenderingCancelledException' || error.name === 'AbortException') return;
    cancelRender();
    lastRenderKey = '';
    showError(error);
  }
}

function navigate(value,{history = true} = {}) {
  const target = validPage(value);
  if (!target) { els['page-number'].setCustomValidity('Введите номер от 1 до 44'); els['page-number'].reportValidity(); return; }
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
  if (target >= 1 && target <= TOTAL) navigate(target);
}
function setZoom(value) {
  zoom = Math.max(.75,Math.min(3,Math.round(value*100)/100));
  updateControls();
  render({resetScroll:zoom === 1});
}

async function loadBook() {
  const loadTicket = ++loadRevision;
  els['error-panel'].hidden = true;
  els['loading-note'].hidden = false;
  els.stage.setAttribute('aria-busy','true');
  let timer;
  try {
    pdfjs ||= await import('./vendor/pdfjs/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.min.mjs',import.meta.url).href;
    if (loadingTask) await loadingTask.destroy();
    loadingTask = pdfjs.getDocument({url:PDF_URL.href,cMapUrl:new URL('vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false,enableXfa:false});
    pdf = await Promise.race([loadingTask.promise,new Promise((_,reject) => {timer = setTimeout(() => reject(new Error('PDF load timeout')),25000);})]);
    if (loadTicket !== loadRevision) return;
    if (pdf.numPages !== TOTAL) throw new Error('Unexpected PDF page count');
    updateControls();
    await render();
  } catch(error) {
    if (loadTicket !== loadRevision) return;
    pdf = null;
    if (loadingTask) { loadingTask.destroy().catch(() => {}); loadingTask = null; }
    updateControls();
    showError(error);
  } finally { clearTimeout(timer); }
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
// A failed worker import is cached by the browser. Reload gives recovery a fresh module graph.
els.retry.addEventListener('click',() => {if (pdf) render();else location.reload();});
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
  resizeTimer = setTimeout(() => {updateControls();render();},120);
}).observe(els.stage);
desktop.addEventListener('change',() => {setSidebar(desktop.matches);updateControls();render({resetScroll:true});});
window.addEventListener('pagehide',() => {savePosition();cancelRender();});
window.addEventListener('pageshow',event => {if (event.persisted) render();});
setSidebar(sidebarOpen);
window.history.replaceState({...window.history.state,craftReaderPage:page},'',location.href);
updateControls();
loadBook();
