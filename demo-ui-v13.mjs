const $=id=>document.getElementById(id);
const purchase=()=>`https://ikraikra.ru/craft${matchMedia('(max-width:639px)').matches?'#craft-mobile-order-form':'#order'}`;
const closeAll=()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close());
window.craftDemoEnd=(outside=false)=>{
  closeAll();$('sample-title').textContent=outside?'Этот раздел — в полной книге':'Демоверсия прочитана';
  $('sample-dialog').querySelector('.app-intro').textContent=outside?'В демо доступны страницы 16–25. Продолжение и остальные главы — в полной версии «Фиолетового CRAFT».':'Вы прочитали фрагмент «Фиолетового CRAFT». Продолжение — в полной версии книги.';
  $('buy-book').href=purchase();$('sample-dialog').showModal();
};
$('mobile-account').addEventListener('click',()=>window.open(purchase(),'_blank','noopener'));
$('mobile-install').addEventListener('click',()=>{$('menu').close()});
for(const button of document.querySelectorAll('[data-close-dialog]'))button.addEventListener('click',()=>button.closest('dialog').close());
$('open-phone').addEventListener('click',()=>{
 const page=window.craftDemoPage||1;
 $('phone-link').value=`https://ikraikra.ru/demo#page=${page}`;
 $('reader-qr').src=`assets/qr/page-${page}.png`;$('reader-qr').hidden=false;$('qr-error').hidden=true;
 $('phone-android-link').href=`open.html?v=13&install=android#page=${page}`;
 $('phone-copy-status').textContent='';$('phone-dialog').showModal();
});
$('reader-qr').addEventListener('error',()=>{$('reader-qr').hidden=true;$('qr-error').hidden=false});
$('copy-phone-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('phone-link').value);$('phone-copy-status').textContent='Ссылка скопирована.'}catch{$('phone-link').focus();$('phone-link').select();$('phone-copy-status').textContent='Выделили ссылку. Выберите «Копировать» в меню браузера.'}});
