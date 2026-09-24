const page = Math.max(1,Math.min(10,Number(new URLSearchParams(location.hash.slice(1)).get('page'))||1));
document.getElementById('back-reader').href = `./#page=${Math.floor(page)}`;
const header = document.querySelector('.pdf-header');
const measureHeader = () => document.documentElement.style.setProperty('--pdf-header-height',`${header.offsetHeight}px`);
measureHeader();
new ResizeObserver(measureHeader).observe(header);
for (const img of document.querySelectorAll('.pdf-spread img')) {
  const error = () => {document.getElementById('preview-error').hidden=false;};
  img.addEventListener('error',error);
  if (img.complete && !img.naturalWidth) error();
}
if (page > 2) requestAnimationFrame(()=>document.getElementById(`spread-${Math.ceil(page/2)}`)?.scrollIntoView());
// Reuse the reader's worker without taking over its installation UI.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
