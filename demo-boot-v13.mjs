import './demo-ui-v13.mjs';
const viewport=document.getElementById('viewport');
const valid=n=>Number.isInteger(n)&&n>=1&&n<=10;
const legacyBook='2676a3c9c706';
let initialPage=Number(new URLSearchParams(location.hash.slice(1)).get('page'));
let savedAnchor=false,lastSource=null;
try{
 savedAnchor=Boolean(JSON.parse(localStorage.getItem('craft-reader-position-v12--demo-html-v13-demo-016-025')||'{}').anchor);
 lastSource=Number(localStorage.getItem('craft-demo-html-v13-source'));
 if(!valid(initialPage)&&!savedAnchor)initialPage=JSON.parse(localStorage.getItem('craft-demo-reader-'+legacyBook)||'{}').page;
}catch{}
let initialSource=valid(initialPage)?initialPage+15:null;
if(performance.getEntriesByType('navigation')[0]?.type==='reload'&&savedAnchor&&lastSource===initialSource)initialSource=null;
const requested=Number(new URLSearchParams(location.search).get('source'));
if(requested>=16&&requested<=25)initialSource=requested;
window.craftDemoBridge={initialSource,position(source,index,count){
  const page=Math.max(1,Math.min(10,source-15));
  if(location.hash!==`#page=${page}`)history.replaceState(null,'',`#page=${page}`);
  window.craftDemoPage=page;
  try{localStorage.setItem('craft-demo-html-v13-source',String(source))}catch{}
  viewport.dataset.sourcePage=String(source);
  viewport.dataset.screen=String(index+1);
  viewport.dataset.total=String(count);
  if(parent!==window)parent.postMessage({type:'craft:reader:page',book:legacyBook,page},'https://ikraikra.ru');
}};
function navigate(page){if(!valid(page)||window.craftDemoPage===page)return;window.craftDemoBridge.initialSource=page+15;window.craftDemoNavigate?.(page+15)}
addEventListener('message',event=>{if(event.origin!=='https://ikraikra.ru'||event.source!==parent||event.data?.book!==legacyBook||event.data?.type!=='craft:reader:navigate')return;navigate(Number(event.data.page))});
addEventListener('hashchange',()=>navigate(Number(new URLSearchParams(location.hash.slice(1)).get('page'))));
async function start(){
  try{
    viewport.textContent='Открываем фрагмент…';
    const response=await fetch('./demo-edition-v13.json',{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Edition '+response.status);
    window.craftMobileConfig=await response.json();
    await import('./demo-runtime-v13.mjs');
    await import('./pwa-v13.js');
  }catch(error){
    console.error(error);
    const text=document.createElement('p');text.className='status';text.textContent='Не удалось открыть фрагмент. Проверьте соединение и попробуйте ещё раз.';
    const button=document.createElement('button');button.textContent='Повторить загрузку';button.addEventListener('click',()=>location.reload());text.append(button);viewport.replaceChildren(text);
  }
}
start();
