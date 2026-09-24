const $ = id => document.getElementById(id);
const publicReader = 'https://anboxdesign.github.io/craft-reader-demo/';
const siteMobile = matchMedia('(max-width:639px)');
let currentPage = 1;
const openers = new WeakMap();
function open(dialog, opener = document.activeElement) {
  if (dialog.open) return;
  openers.set(dialog, opener);
  dialog.showModal();
}
for (const dialog of [$('sample-dialog'),$('phone-dialog')]) {
  dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>openers.get(dialog)?.focus({preventScroll:true}));
}
function updatePurchase() {
  $('buy-book').href = 'https://ikraikra.ru/craft' + (siteMobile.matches ? '#craft-mobile-order-form' : '#order');
  $('purchase-note').textContent = navigator.onLine ? 'Заказ — на сайте ИКРЫ. Если сайт открылся с начала, нажмите «Купить книгу» в шапке.' : 'Для перехода к форме заказа нужен интернет.';
}
export function updateJourney({page,atEnd}) {
  currentPage = page;
  document.querySelectorAll('[data-pdf-preview]').forEach(link=>link.href=`pdf.html#page=${page}`);
  $('sample-end').hidden = !atEnd;
  $('reading-hint').hidden = atEnd;
}
export function openSampleEnd(opener = $('next')) {updatePurchase();open($('sample-dialog'),opener);}
$('sample-end').addEventListener('click',()=>openSampleEnd($('sample-end')));
$('open-phone').addEventListener('click',()=>{
  $('phone-link').value = `${publicReader}#page=${currentPage}`;
  $('reader-qr').hidden = false;
  $('qr-error').hidden = true;
  $('reader-qr').src = `assets/qr/page-${currentPage}.png`;
  $('phone-copy-status').textContent = '';
  open($('phone-dialog'),$('open-phone'));
});
$('reader-qr').addEventListener('error',()=>{$('reader-qr').hidden=true;$('qr-error').hidden=false;});
$('copy-phone-link').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('phone-link').value);$('phone-copy-status').textContent='Ссылка скопирована.';}
  catch {$('phone-link').focus();$('phone-link').select();$('phone-copy-status').textContent='Выделили ссылку. Выберите «Копировать» в меню браузера.';}
});
siteMobile.addEventListener('change',updatePurchase);
window.addEventListener('online',updatePurchase);
window.addEventListener('offline',updatePurchase);
updatePurchase();
