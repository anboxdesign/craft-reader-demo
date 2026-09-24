const RELEASE = 10;
const status = document.getElementById('entry-status');
const destination = new URL('./',location.href);
const install = new URLSearchParams(location.search).get('install');
if (['android','2'].includes(install)) destination.searchParams.set('install',install);
const page = Number(new URLSearchParams(location.hash.slice(1)).get('page'));
if (Number.isInteger(page) && page >= 1 && page <= 10) destination.hash = `page=${page}`;
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
function releaseOf(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
    const timer=setTimeout(()=>finish(null),900);
    channel.port1.onmessage=event=>finish(event.data?.release);
    worker.postMessage({type:'GET_RELEASE'},[channel.port2]);
  });
}
let opening = false;
async function start() {
  if (opening) return;
  opening=true;
  document.getElementById('entry-error').hidden=true;
  status.textContent='Проверяем читалку. Книга откроется на нужной странице.';
  try {
    if (!('serviceWorker' in navigator)) {location.replace(destination.href);return;}
    // open.html is outside the legacy worker's cached index route.
    const existing=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);
    if (existing?.active?.state === 'activated' && await releaseOf(existing.active) >= RELEASE) {location.replace(destination.href);return;}
    status.textContent='Обновляем читалку. Сохранённая книга и место чтения останутся на устройстве.';
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    await registration.update();
    const deadline=Date.now()+45000;
    while(Date.now()<deadline) {
      if (registration.waiting && await releaseOf(registration.waiting) >= RELEASE) registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
      if (registration.active?.state==='activated' && await releaseOf(registration.active) >= RELEASE) {
        location.replace(destination.href);return;
      }
      await pause(150);
    }
    throw new Error('Update timeout');
  } catch {
    status.textContent='Не удалось открыть новую версию.';
    document.getElementById('entry-error').hidden=false;
    opening=false;
  }
}
document.getElementById('entry-retry').addEventListener('click',start);
start();
