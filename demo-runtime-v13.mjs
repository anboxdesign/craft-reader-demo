import {WheelPager} from './wheel-pager.mjs';
const readerConfig=window.craftMobileConfig;
const personalNamespace=readerConfig.personalNamespace;
const continuousBook=readerConfig.continuous===true;
const bookBatch=readerConfig.batch,bookCatalogue=readerConfig.catalogue,readerReleaseHash=readerConfig.release;
const editionBundle=readerConfig.embedded;
const packedData=await new Response(new Blob([Uint8Array.from(atob(editionBundle.packed),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
const fullBook=packedData.book,russianHyphens=packedData.hyphens,editorRegistry=packedData.registry;
const embeddedAssets=editionBundle.assets,embeddedContent=continuousBook?JSON.parse(JSON.stringify(fullBook)):selectBatchContent(fullBook,bookBatch);
for(const s of embeddedContent.sections)for(const img of [s.image,s.artwork])if(img){
 img.src=embeddedAssets[img.src]||img.src;
 if(img.readingMasks?.length){
  const originalSource=img.src;try{
  let source=img.src;if(!source.startsWith('data:')){const response=await fetch(source);if(!response.ok)throw Error('Reading image '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const n of bytes)binary+=String.fromCharCode(n);source='data:'+response.headers.get('content-type')+';base64,'+btoa(binary)}
  const rectangles=img.readingMasks.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="white"/>`).join('');
  let svg;if(source.startsWith('data:image/svg+xml')){const raw=source.split(',').slice(1).join(',');svg=(source.slice(0,source.indexOf(',')).includes('base64')?new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0))):decodeURIComponent(raw)).replace(/<\/svg>\s*$/,rectangles+'</svg>')}
  else svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}"><image href="${source}" width="${img.width}" height="${img.height}"/>${rectangles}</svg>`;
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }catch{img.readingAssetError=true;img.retrySource=originalSource;img.src='data:image/png;base64,'}
 }
}

function hyphenateLabel(text){return text.replaceAll('\u00ad','').replace(/[А-Яа-яЁё]{7,}/g,word=>{const cuts=russianHyphens[word.toLowerCase()];if(!cuts)return word;let out='',from=0;for(const n of cuts){out+=word.slice(from,n)+'\u00ad';from=n}return out+word.slice(from)})}

const hyphenCache=new Map();
function softOffsets(block){
 if(hyphenCache.has(block.id))return hyphenCache.get(block.id);
 let text='',map=[];for(let i=0;i<block.text.length;i++){if(block.text[i]==='\u00ad'||block.omissions?.some(o=>i>=o.start&&i<o.end))continue;text+=block.text[i];map.push(i)}
 const offsets=[];for(const match of text.matchAll(/[А-Яа-яЁё]{7,}/g))for(const n of russianHyphens[match[0].toLowerCase()]||[])offsets.push(map[match.index+n]);
 hyphenCache.set(block.id,offsets);return offsets;
}
function referenceButton(ref){
 const button=document.createElement('button');button.type='button';button.className=ref.kind==='footnote'?'inline-footnote':'comment-ref';
 if(ref.kind==='footnote'){button.dataset.footnote=ref.id;button.dataset.label=ref.label;button.setAttribute('aria-label','Открыть сноску '+ref.label)}
 else{button.dataset.comment=ref.id;button.setAttribute('aria-label','Перейти к комментарию '+ref.label)}
 const sup=document.createElement('sup');sup.textContent=ref.label;button.append(sup);return button;
}
function richText(parent,block,start,end,includeEndRefs=false){
 if(block.keepFootnotesTogether&&!block.wrappingFootnote){
  const inner={...block,wrappingFootnote:true};let cursor=start;
  for(const ref of block.references||[]){
   if(ref.kind!=='footnote'||ref.offset<start||ref.offset>=end)continue;
   let a=ref.offset;while(a>start&&!/[\s\u00a0]/.test(block.text[a-1]))a--;
   let z=ref.offset;while(z<end&&((block.omissions||[]).some(o=>z>=o.start&&z<o.end)||/[.,;:!?»)]/.test(block.text[z])))z++;
   if(a>cursor)richText(parent,inner,cursor,a);
   const keep=document.createElement('span');keep.className='reference-keep';richText(keep,inner,a,z,z===end&&includeEndRefs);parent.append(keep);cursor=z;
  }
  if(cursor<end)richText(parent,inner,cursor,end,includeEndRefs);return;
 }
 const spans=block.spans||[],refs=block.references||[],hyphens=new Set([...softOffsets(block),...(block.layout?.hyphens||[])]);
 const stops=[...new Set([start,end,...spans.flatMap(s=>[s.start,s.end]),...(block.omissions||[]).flatMap(o=>[o.start,o.end]),...refs.map(r=>r.offset),...hyphens])].filter(n=>n>=start&&n<=end).sort((a,b)=>a-b);
 const addRefs=at=>{for(const ref of refs.filter(r=>r.offset===at))parent.append(referenceButton(ref))};
 for(let i=0;i<stops.length-1;i++){
  const a=stops[i],b=stops[i+1];addRefs(a);
  if(block.omissions?.some(o=>a>=o.start&&b<=o.end))continue;
  // Replace printed-line opportunities with dictionary positions, rather than
  // combining them into illegal one-letter syllables. Canonical offsets stay.
  let text=block.text.slice(a,b).replaceAll('\u00ad','');if(hyphens.has(b)&&b<block.text.length)text+='\u00ad';
  const span=spans.find(s=>s.start<=a&&s.end>=b&&s.style==='a')||spans.find(s=>s.start<=a&&s.end>=b);
  if(span){const el=document.createElement(span.style==='a'?'a':'span');el.textContent=text;el.className=span.className||'';if(span.source){el.href=bookFileFor(span.source)+'?source='+span.source;el.dataset.sourceLink=span.source;if(span.anchor){el.dataset.sourceAnchor=span.anchor;el.href+='&anchor='+encodeURIComponent(span.anchor)}}if(span.href){el.href=span.href;el.target='_blank';el.rel='noopener noreferrer'}if(span.materialId){const m=embeddedContent.materials.find(m=>m.id===span.materialId);if(m)setMaterialLink(el,m)}parent.append(el)}else parent.append(document.createTextNode(text));
 }
 if(end===block.text.length||includeEndRefs)addRefs(end);
}
const inheritedCells=new Map();
function decorateConflictFrames(root){
 for(const el of root.querySelectorAll('.conflict-cloud')){
  const w=el.clientWidth,h=el.clientHeight,r=Math.min(22,w/4,h/4),a=4,b=w-4,c=h-4;
  const segments=[],line=(x,y,dx,dy,len)=>segments.push({len,point:t=>[x+dx*t,y+dy*t,dy,-dx]}),arc=(x,y,angle)=>segments.push({len:Math.PI*r/2,point:t=>{const q=angle+t/r;return [x+r*Math.cos(q),y+r*Math.sin(q),Math.cos(q),Math.sin(q)]}});
  line(a+r,a,1,0,b-a-2*r);arc(b-r,a+r,-Math.PI/2);line(b,a+r,0,1,c-a-2*r);arc(b-r,c-r,0);line(b-r,c,-1,0,b-a-2*r);arc(a+r,c-r,Math.PI/2);line(a,c-r,0,-1,c-a-2*r);arc(a+r,a+r,Math.PI);
  const length=segments.reduce((n,s)=>n+s.len,0),waves=Math.max(1,Math.round(length/12)),steps=waves*10,points=[];
  for(let i=0;i<=steps;i++){const distance=length*i/steps;let local=distance,segment=segments.at(-1);for(const s of segments){segment=s;if(local<=s.len)break;local-=s.len}const [x,y,nx,ny]=segment.point(Math.min(local,segment.len)),v=1.1*Math.sin(distance/length*waves*Math.PI*2);points.push((i?'L':'M')+(x+nx*v).toFixed(2)+','+(y+ny*v).toFixed(2))}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.classList.add('conflict-frame');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('aria-hidden','true');svg.dataset.ui='true';path.setAttribute('d',points.join('')+'Z');svg.append(path);el.append(svg);
 }
}
document.addEventListener('readerpagechange',()=>decorateConflictFrames(viewport));
function resolveInheritedCell(id,seen=new Set()){
 if(seen.has(id))return null;seen.add(id);
 if(!inheritedCells.size)for(const block of fullBook.blocks)for(const row of block.table?.rows||[])for(const cell of row.cells||[])if(cell.id)inheritedCells.set(cell.id,{block,cell});
 const found=inheritedCells.get(id);return found?.cell.inheritsCell?resolveInheritedCell(found.cell.inheritsCell,seen):found;
}
function tableFragment(block,start,end){
 const el=document.createElement('div');el.className='adaptive-table';const columns=block.table.headers.length;el.classList.toggle('compact-tables',(layoutWidth-16*(columns-1))/columns<font*10);el.setAttribute('role','table');el.setAttribute('aria-label','Таблица со страницы '+block.source);el.style.setProperty('--table-columns',columns);
 if(block.table.frame==='conflict-cloud')el.classList.add('conflict-cloud');
 if(block.table.transposedBlank){el.classList.add('transposed-table');const heading=document.createElement('div');heading.className='table-heading';heading.setAttribute('role','row');heading.dataset.ui='true';for(const name of block.table.headers){const cell=document.createElement('div');cell.textContent=name;cell.setAttribute('role','columnheader');heading.append(cell)}el.append(heading);}
 for(const row of block.table.rows){
  if(row.end<=start||row.start>=end)continue;
  if(row.kind==='group'){const group=document.createElement('h3');group.className='table-group';richText(group,block,Math.max(start,row.start),Math.min(end,row.end),end>=row.end);el.append(group);continue}
  const rowEl=document.createElement('div');rowEl.className='table-row';rowEl.dataset.tableRow=row.id;rowEl.setAttribute('role','row');

  for(const cell of row.cells){const cellEl=document.createElement('div');cellEl.className='table-cell';cellEl.setAttribute('role','cell');cellEl.dataset.column=cell.column;
   const a=Math.max(start,cell.start),b=Math.min(end,cell.end);
   if(cell.hideEmptyLabel)cellEl.classList.add('approved-empty-cell');
   if(cell.tracking)cellEl.style.letterSpacing=cell.tracking+'em';
   if(b>a||cell.start===cell.end&&cell.start>=start&&cell.start<end){
    const label=document.createElement('div');label.className='table-label';if(cell.column>=(block.table.normalLabelsFrom??Infinity))label.classList.add('table-label-normal');label.textContent=hyphenateLabel(block.table.headers[cell.column]);label.dataset.ui='true';if(row===block.table.rows.find(r=>r.kind!=='group')&&a===cell.start)for(const ref of block.table.headerReferences?.[cell.column]||[])label.append(referenceButton({...ref,kind:ref.kind||'footnote'}));if(label.childNodes.length&&!cell.hideEmptyLabel&&!block.table.transposedBlank)cellEl.append(label);
    const body=document.createElement('div');body.className='table-copy';body.dataset.rangeStart=a;body.dataset.rangeEnd=b;richText(body,block,a,b,b===cell.end);cellEl.append(body);
    if(cell.inheritsCell&&a===b){
     const origin=resolveInheritedCell(cell.inheritsCell);if(origin){
      const text=origin.block.text.slice(origin.cell.start,origin.cell.end).replaceAll('\u00ad','');
      const tooTall=Math.ceil(text.length/Math.max(10,(layoutWidth-28)/(font*.55)))*font*1.55>layoutHeight*.45;
      const inherited=document.createElement(tooTall?'button':'div');inherited.className=tooTall?'table-inherited':'table-inherited-copy';inherited.dataset.ui='true';
      if(tooTall){inherited.type='button';inherited.dataset.inheritedCell=cell.inheritsCell;inherited.textContent=text.split(':')[0].split(/\s+/).slice(0,4).join(' ')+'…';inherited.setAttribute('aria-label','Прочитать полностью: '+text)}else richText(inherited,{...origin.block,references:[]},origin.cell.start,origin.cell.end);body.append(inherited)
     }
    }
   }else cellEl.classList.add('table-cell-empty-fragment');
   rowEl.append(cellEl);
  }el.append(rowEl);
 }
 return el;
}
function sourceFragment(block,start=0,end=block.text.length){
 const el=block.type==='table'?tableFragment(block,start,end):document.createElement(block.type==='h2'?'h2':block.type==='comment-title'?'h3':'p');
 el.dataset.block=block.id;el.dataset.start=start;el.dataset.end=end;
 if(block.type==='table')return el;
 if(['toc','imprint'].includes(block.type))el.classList.add(block.type);
 if(block.type==='note')el.className='note-text';
 if(['comment-title','comment'].includes(block.type))el.classList.add(block.type);
 if(block.preserveLineBreaks)el.classList.add('preserve-lines');
 if(start)el.classList.add('continuation');
 if(block.type==='resource'){
  const material=embeddedContent.materials.find(m=>m.id===block.resourceId),link=document.createElement('a');el.className='resource-link';link.textContent=block.text.slice(start,end);
  setMaterialLink(link,material);el.append(link);return el;
 }
 if(block.type==='toc'){
  const [original,...lines]=block.text.split('\n'),num=document.createElement('span'),copy=document.createElement('span');num.className='toc-number';num.dataset.tocSource=original;num.textContent=screenNumbers?.sources?.[original]??'…';num.dataset.ui='true';copy.className='toc-copy';
  const contentStart=original.length+1,authorEnd=lines.length>1?contentStart+lines[0].length:contentStart;
  if(authorEnd>Math.max(start,contentStart)){const author=document.createElement('span');author.className='toc-author';richText(author,block,Math.max(start,contentStart),Math.min(end,authorEnd));copy.append(author)}
  const copyStart=Math.max(start,authorEnd>contentStart?authorEnd+1:contentStart);if(end>copyStart)richText(copy,block,copyStart,end);
  el.classList.add('toc-row');el.append(num,copy);el.dataset.sourceLink=original;el.tabIndex=0;el.setAttribute('role','link');el.addEventListener('keydown',e=>{if(e.key==='Enter')visitSource(Number(original))});return el;
 }
 if(block.commentNumber&&start===0){const badge=document.createElement('span');badge.className='speaker-number';badge.textContent=block.commentNumber;badge.dataset.ui='true';el.append(badge)}
 richText(el,block,start,end);return el;
}
function fragment(block,start=0,end=block.text.length,part={}){return block.kind==='image'?editImageFragment(block,layoutWidth,layoutHeight,part.imageHeight):editTextFragment(block,start,end)}
let layoutWidth=0,layoutHeight=0,measuring=false;
function assembledParts(parts,spacing=1){
 const result=document.createDocumentFragment();let previous=null,container=null;
 for(const part of parts){
  const block=editBlock(part.id),group=block.speechGroup||block.paragraphGroup,node=fragment(block,part.start,part.end,part);
  if(block.type==='table')node.style.setProperty('--table-space',spacing);
  if(group){
   if(previous?.group!==group){container=document.createElement('div');container.className=block.speechGroup?'speech-bubble':'joined-paragraph';container.dataset.group=group;
    container.style.marginTop=result.childNodes.length?editGap(block,spacing)+'px':'0';
    if(block.speechGroup&&(block.id!==group||part.start)){const label=document.createElement('div');label.className='speech-continuation';label.textContent=editBlock(group)?.type==='comment-title'?'Продолжение комментария':'Продолжение';label.dataset.ui='true';container.append(label)}
    result.append(container);
   }
   if(block.paragraphGroup){node.style.display='inline';if(previous?.group===group&&part.start===0&&!block.joinTight)container.append(document.createTextNode(' '));}
   node.style.marginTop=block.speechGroup&&container.querySelector('[data-block]')?'0.6em':'0';container.append(node);
  }else{node.style.marginTop=result.childNodes.length?editGap(block,spacing)+'px':'0';result.append(node);container=null}
  previous={group};
 }
 return result;
}
function breakPoints(block){
 // Discretionary hyphens wrap lines, never split a word between screens.
 let ends=[...block.text.matchAll(/[ \n]/g)].map(m=>m.index+1);ends.push(block.text.length);
 // A printed URL can be taller than the screen at large type. Its characters
 // may continue on the next screen; ordinary words still break only at spaces.
 for(const match of block.text.matchAll(/https?:\/\/\S+/g))for(let n=1;n<=match[0].length;n++)if(!/[\uD800-\uDBFF]/.test(match[0][n-1]))ends.push(match.index+n);
 if(block.type==='toc')ends=ends.filter(n=>n>block.text.indexOf('\n')+1);
 for(const o of block.omissions||[])ends=ends.filter(n=>n<=o.start||n>=o.end);
 return [...new Set(ends)].sort((a,b)=>a-b);
}
function* paginate(blocks,width,height,measure){
 layoutWidth=width;layoutHeight=height;measure.style.width=width+'px';measure.classList.toggle('compact-tables',width<font*36||height<font*23);
 const pages=[],heights=new Map();let parts=[];
 const minimumSpacing=.64;
 const mount=(candidate,spacing=1)=>{measuring=true;measure.replaceChildren(assembledParts(candidate,spacing));measuring=false};
 const measuredHeight=(candidate,spacing=1)=>{const key=spacing+':'+candidate.map(p=>p.id+':'+p.start+':'+p.end+':'+(p.imageHeight||'')).join('|');if(heights.has(key))return heights.get(key);mount(candidate,spacing);const value=measure.getBoundingClientRect().height;heights.set(key,value);return value};
 const fits=candidate=>measuredHeight(candidate)<=height+.1||measuredHeight(candidate,minimumSpacing)<=height+.1;
 const pageSpacing=candidate=>{if(measuredHeight(candidate)<=height+.1)return 1;let low=minimumSpacing,high=1;for(let i=0;i<6;i++){const mid=(low+high)/2;if(measuredHeight(candidate,mid)<=height+.1)low=mid;else high=mid}return low};
 const finish=()=>{if(parts.length)pages.push({type:'text',parts,gapScale:pageSpacing(parts)});parts=[]};
 const lines=part=>{
  mount([part]);const tops=[],walker=document.createTreeWalker(measure,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   if(!node.textContent.trim()||node.parentElement.closest('button,[data-ui],.table-label'))continue;
   const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width>.1&&r.height>font*.5&&!tops.some(t=>Math.abs(t-r.top)<font*.4))tops.push(r.top);
  }return tops.length;
 };
 const nextPart=next=>{
  const full={id:next.id,start:0,end:next.text.length};if(next.kind==='image')return full;
  if((next.keepWholeIfFits||next.type==='p'&&measuredHeight([full])<=height*.5)&&fits([full]))return full;
  if(next.type==='imprint')return {...full,end:next.text.includes('\n')?next.text.indexOf('\n')+1:next.text.length};
  if(next.type!=='table'&&lines(full)<=3)return full;
  const cuts=breakPoints(next);let low=0,high=cuts.length-1,best=high;
  while(low<=high){const mid=(low+high)>>1;if(lines({...full,end:cuts[mid]})>=2){best=mid;high=mid-1}else low=mid+1}
  return {...full,end:cuts[best]??next.text.length};
 };
 for(let i=0;i<blocks.length;i++){
  yield;
  const block=blocks[i];let start=0;
  if(block.kind==='image'){
   let part={id:block.id,start:0,end:0};
   if(parts.length&&!fits([...parts,part])){
    mount([part]);const natural=Number(measure.querySelector('img')?.dataset.imageHeight)||0;
    const overflow=measuredHeight([...parts,part],minimumSpacing)-height;
    const fitted={...part,imageHeight:Math.floor(natural-overflow-1)};
    // A small proportional reduction is preferable to a mostly empty screen.
    if(natural>0&&fitted.imageHeight>=natural*.85&&fits([...parts,fitted]))part=fitted;else finish();
   }
   if(!fits([part])){mount([part]);const natural=Number(measure.querySelector('img')?.dataset.imageHeight)||0;part.imageHeight=Math.max(20,natural-(measuredHeight([part])-height)-2)}
   parts.push(part);continue;
  }
  const group=block.speechGroup;
  if(group&&block.id===group){const siblings=[];for(let j=i;j<blocks.length&&blocks[j].speechGroup===group;j++)siblings.push(blocks[j]);
   const candidate=siblings.map(b=>({id:b.id,start:0,end:b.text.length}));if(measuredHeight(candidate)<=height*.32&&!fits([...parts,...candidate]))finish();
  }
  const ends=breakPoints(block);
  if(block.type==='table'&&parts.length){const whole={id:block.id,start:0,end:block.text.length};
   const previous=editBlock(parts.at(-1).id),kept=previous.layout?.keepNext||['h2','comment-title'].includes(previous.type);
   if(!kept&&fits([whole])&&(block.keepWholeIfFits||block.table.rows.filter(r=>r.kind!=='group').length===1&&measuredHeight([whole])<height*.7)&&!fits([...parts,whole]))finish();
  }
  // Resource links stay with the image or the final two lines they describe.
  if(block.type==='resource'&&parts.length&&!fits([...parts,{id:block.id,start:0,end:block.text.length}])){
   const prior=parts.at(-1),priorBlock=editBlock(prior.id),resource={id:block.id,start:0,end:block.text.length};
   if(priorBlock.kind==='image'&&fits([prior,resource])){parts.pop();finish();parts.push(prior)}
   else if(['p','comment'].includes(priorBlock.type)){
    const cuts=breakPoints(priorBlock).filter(n=>n>prior.start&&n<prior.end);
    const cut=cuts.findLast(n=>lines({...prior,start:n})>=2&&fits([{...prior,start:n},resource]));
    if(cut){parts[parts.length-1]={...prior,end:cut};finish();parts.push({...prior,start:cut})}
    else if(fits([prior,resource])){parts.pop();finish();parts.push(prior)}
   }
  }
  while(start<block.text.length){
   yield;
   let sectionEnd=block.text.length;
   if(block.table?.examplesPerScreen){
    const limit=width>=600?2:1,already=parts.reduce((n,p)=>{const other=editBlock(p.id);return n+(other.table?.groupId===block.table.groupId?other.table.rows.filter(r=>r.kind==='group'&&r.start>=p.start&&r.start<p.end).length:0)},0);
    if(already>=limit){finish();continue}
    const groups=block.table.rows.filter(r=>r.kind==='group'),at=Math.max(0,groups.findLastIndex(r=>r.start<=start)),count=limit-already;sectionEnd=groups[at+count]?.start??block.text.length;
   }
   const full={id:block.id,start,end:sectionEnd};
   if(fits([...parts,full])){
    const next=sectionEnd===block.text.length?blocks[i+1]:null,keep=block.layout?.keepNext??(['h2','comment-title'].includes(block.type)||next?.joinPrevious);
    if(keep&&next&&!next.hiddenFlow){let leading=[];let n=i+1;while(n<blocks.length&&(['h2','comment-title'].includes(blocks[n].type)||(blocks[n].layout?.keepNext===true&&blocks[n].kind==='text'&&measuredHeight([{id:blocks[n].id,start:0,end:blocks[n].text.length}])<=font*1.48*3.1))){leading.push({id:blocks[n].id,start:0,end:blocks[n].text.length});n++}if(n<blocks.length)leading.push(nextPart(blocks[n]));
     // On a short screen, keep adjacent headings with at least one body line.
     // Reserving an entire short paragraph can otherwise strand the first heading.
     const after=blocks[n],previous=parts.length&&editBlock(parts.at(-1).id);
     if(['h2','comment-title'].includes(block.type)&&after&&['p','comment'].includes(after.type)){
      const minimum=[...leading.slice(0,-1),{id:after.id,start:0,end:breakPoints(after)[0]}];
      if((!fits([full,...leading])&&fits([full,...minimum]))||(['h2','comment-title'].includes(previous?.type)&&fits([...parts,full,...minimum])))leading=minimum;
     }
     const short=['h2','comment-title'].includes(block.type)||measuredHeight([full])<=font*1.48*3.1;
     if(parts.length&&short&&fits([full,...leading])&&!fits([...parts,full,...leading])){finish();continue}
     if(parts.length&&['h2','comment-title'].includes(block.type)&&['p','comment'].includes(next.type)&&!fits([...parts,full,...leading])){
      const firstWord={id:next.id,start:0,end:breakPoints(next)[0]};if(fits([full,firstWord])){finish();continue}
     }
     // An explicit keep-next also applies to long paragraphs: carry their last
     // two lines with the next block instead of moving the whole paragraph.
     if(!short&&block.layout?.keepNext===true&&!fits([...parts,full,...leading])){
      const cuts=ends.filter(end=>end>start&&end<block.text.length);let low=0,high=cuts.length-1,split=-1;
      while(low<=high){const mid=(low+high)>>1,tail={...full,start:cuts[mid]};if(lines(tail)>=2){split=mid;low=mid+1}else high=mid-1}
      if(split>=0){const end=cuts[split],tail={...full,start:end};if(lines({...full,end})>=2&&fits([tail,...leading])){parts.push({...full,end});start=end;finish();continue}}
     }
    }
    parts.push(full);if(sectionEnd<block.text.length){start=sectionEnd;finish();continue}break;
   }
   if(parts.length&&['toc','note','h2','comment-title'].includes(block.type)&&fits([full])){finish();continue}
   const preceding=parts.length?editBlock(parts.at(-1).id):null,precedingHeading=preceding&&['h2','comment-title'].includes(preceding.type);
   if(parts.length&&!precedingHeading&&start===0&&block.type!=='table'&&fits([full])&&(block.keepWholeIfFits||block.type==='p'&&measuredHeight([full])<=height*.5||lines(full)<=3)){finish();continue}
   const candidates=ends.filter(n=>n>start&&n<=sectionEnd);let lo=0,hi=candidates.length-1,best=-1;
   while(lo<=hi){const mid=(lo+hi)>>1;if(fits([...parts,{id:block.id,start,end:candidates[mid]}])){best=mid;lo=mid+1}else hi=mid-1}
   if(best<0){if(parts.length){finish();continue}throw Error('Экран слишком низкий для строки '+block.id)}
   let end=candidates[best];
   if(parts.length&&block.type!=='table'&&lines({id:block.id,start,end})<2){
    // At maximum type in a short landscape viewport a long comment author
    // can share only one body line. Keep that line with the author, provided
    // the continuation still has at least two lines; never reduce type size.
    const headingTail=precedingHeading&&lines({id:block.id,start:end,end:block.text.length})>=2;
    if(!headingTail){finish();continue}
   }
   if(block.type==='table'){
    const currentRow=block.table.rows.find(r=>r.start<=end&&r.end>end&&r.kind!=='group');
    if(currentRow&&currentRow.start>=start){
     const ri=block.table.rows.indexOf(currentRow),group=block.table.rows[ri-1];
     const rowStart=group?.kind==='group'&&group.start>=start?group.start:currentRow.start;
     if(fits([{id:block.id,start:rowStart,end:currentRow.end}])){
      if(rowStart>start)end=rowStart;else if(parts.length&&!preceding?.layout?.keepNext&&!precedingHeading){finish();continue}
     }
    }
    const rowEnds=block.table.rows.map(r=>r.end).filter(n=>n>start&&n<=end);
    if(rowEnds.length){const boundary=rowEnds.at(-1),last=block.table.rows.find(r=>r.end===boundary),atBoundary=[...parts,{id:block.id,start,end:boundary}];
     // Prefer an intact row when it leaves no large gap; otherwise continue the
     // row using the same canonical cell offsets and repeated column labels.
     if(boundary===block.text.length||boundary===end||measuredHeight(atBoundary,minimumSpacing)>=height*.78)end=boundary;
     if(last?.kind==='group'&&end===boundary&&end<block.text.length&&last.start>start)end=last.start;
    }
    const hanging=block.table.rows.find((r,j)=>r.kind==='group'&&r.start<end&&end<=(block.table.rows[j+1]?.start??r.end));
    if(hanging){if(hanging.start>start)end=hanging.start;else if(parts.length&&fits([{id:block.id,start,end:hanging.end}])){finish();continue}}
   }else if(end<block.text.length&&lines({id:block.id,start:end,end:block.text.length})===1){
    // First try the full tail through flexible block gaps (the full-fit branch
    // above). If that cannot fit, leave two real lines rather than a lone line.
    let low=0,high=best-1,balanced=-1;
    while(low<=high){const mid=(low+high)>>1;if(lines({id:block.id,start:candidates[mid],end:block.text.length})>=2){balanced=mid;low=mid+1}else high=mid-1}
    if(balanced>=0&&lines({id:block.id,start,end:candidates[balanced]})>=(precedingHeading?1:2))end=candidates[balanced];
   }
   parts.push({id:block.id,start,end});start=end;finish();
  }
 }
 finish();measure.replaceChildren();return pages;
}

const storageKey=('craft-personal-notes-v1'+personalNamespace);
const clean=text=>text.replaceAll('\u00ad','');
function setupNotes({fragmentId,viewport,inform,capture,isDialog,getLocation,navigate,getBlockText=()=>null,getBlock=()=>null}){
  const $=id=>document.getElementById(id),list=$('notes-list'),editor=$('note-editor');
  let selected=null,draft=null;
  function read(){
    const raw=localStorage.getItem(storageKey);if(!raw)return [];
    const value=JSON.parse(raw);
    if(!Array.isArray(value)||value.some(n=>!n||typeof n.id!=='string'||typeof n.body!=='string'||typeof n.quote!=='string'||!(['opening','pyramids','conflicts'].includes(n.fragmentId)||/^book-\d{3}-\d{3}$/.test(n.fragmentId))||typeof n.anchor?.id!=='string'||!Number.isInteger(n.anchor.offset)||!(Number.isInteger(n.source)||/^\d+–\d+$/.test(n.source))))throw new Error('Invalid notes');
    return value;
  }
  function commit(notes){localStorage.setItem(storageKey,JSON.stringify(notes));updateCount()}
  function updateCount(){try{$('notes-count').textContent=read().length||''}catch{$('notes-count').textContent=''}}
  function openEditor(point,note=null){
    capture();$('menu').close();$('notes').close();
    draft=note?{...note,anchor:{...note.anchor}}:{...point,id:crypto.randomUUID(),quote:point.quote||'',body:'',createdAt:new Date().toISOString()};
    $('note-location').textContent=notePageLabel(draft.anchor);
    $('note-quote').textContent=draft.quote;$('note-quote').hidden=!draft.quote;
    $('note-text').value=draft.body;$('note-error').textContent='';
    $('selection-note').hidden=true;getSelection()?.removeAllRanges();editor.showModal();$('note-text').focus();
  }
  function showList(){capture();$('menu').close();renderList();$('notes').showModal()}
  function renderList(){
    list.replaceChildren();let notes;
    try{notes=read()}catch{const error=document.createElement('p');error.className='error';error.textContent='Не удалось прочитать заметки. Хранилище браузера недоступно или повреждено. Существующие данные не изменены.';list.append(error);$('notes-export').disabled=true;return}
    $('notes-export').disabled=!notes.length;
    if(!notes.length){const empty=document.createElement('p');empty.className='notes-empty';empty.textContent='Пока нет заметок. Выделите текст или выберите «Добавить заметку» в меню.';list.append(empty)}
    for(const note of notes.slice().reverse()){
      const item=document.createElement('article');item.className='personal-note';
      const location=document.createElement('button');location.className='note-location';location.textContent=notePageLabel(note.anchor)+' ↗';location.setAttribute('aria-label','Перейти к заметке');
      location.addEventListener('click',()=>{
        const resolved=visibleAnchor(note.anchor),file=anchorFile(note.anchor);
        if(file!==bookBatch.file){try{rememberReading();window.location.assign(file+'?anchor='+encodeURIComponent(resolved.id)+'&offset='+resolved.offset)}catch{inform('Не удалось перейти к заметке. Проверьте доступ к хранилищу.')}return}
        $('notes').close();navigate(note);
      });
      const body=document.createElement('p');body.className='note-body';body.textContent=note.body;
      item.append(location);
      if(note.quote){const quote=document.createElement('blockquote');quote.textContent=note.quote;item.append(quote)}
      item.append(body);
      const actions=document.createElement('div');actions.className='note-actions';
      const edit=document.createElement('button');edit.textContent='Изменить';edit.addEventListener('click',()=>openEditor(null,note));
      const remove=document.createElement('button');remove.textContent='Удалить';let armed=false;remove.addEventListener('click',()=>{if(!armed){armed=true;remove.textContent='Подтвердить удаление';return}try{commit(read().filter(n=>n.id!==note.id));renderList()}catch{inform('Не удалось удалить заметку. Данные не изменены.')}});
      actions.append(edit,remove);item.append(actions);list.append(item);
    }
  }
  $('notes-open').addEventListener('click',showList);
  $('note-current').addEventListener('click',()=>openEditor(getLocation()));
  $('selection-note').addEventListener('pointerdown',e=>e.preventDefault());
  $('selection-note').addEventListener('click',()=>{if(selected)openEditor(selected)});
  $('note-cancel').addEventListener('click',()=>editor.close());
  $('note-form').addEventListener('submit',e=>{
    e.preventDefault();const body=$('note-text').value.trim();if(!body){$('note-error').textContent='Напишите текст заметки.';return}
    try{const notes=read(),next={...draft,body,updatedAt:new Date().toISOString()},i=notes.findIndex(n=>n.id===next.id);if(i>=0)notes[i]=next;else notes.push(next);commit(notes);editor.close();inform('Заметка сохранена в этом браузере.')}
    catch{$('note-error').textContent='Не удалось сохранить. Проверьте свободное место и доступ к хранилищу браузера. Ваш текст остаётся в поле.'}
  });
  $('notes-export').addEventListener('click',()=>{
    try{const notes=read();const content=notes.map(n=>`${notePageLabel(n.anchor)}\n${n.quote?'«'+n.quote+'»\n':''}${n.body}`).join('\n\n— — —\n\n');const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='CRAFT-заметки.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{inform('Не удалось скачать заметки.')}
  });
  function selectionChanged(){
    const selection=getSelection();selected=null;$('selection-note').hidden=true;
    if(isDialog()||!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0);if(!viewport.contains(range.startContainer)||!viewport.contains(range.endContainer))return;
    const parent=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    const block=parent.closest('[data-block]');if(!block)return;
    const quote=clean(selection.toString()).trim();if(!quote)return;
    const before=document.createRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);
    const preceding=before.cloneContents();preceding.querySelectorAll('button,[data-ui]').forEach(button=>button.remove());
    const source=getBlock(block.dataset.block),cell=parent.closest('[data-range-start]'),start=Number(cell?.dataset.rangeStart??block.dataset.start);
    let visibleLength=clean(preceding.textContent).length;
    if(cell){const local=document.createRange();local.selectNodeContents(cell);local.setEnd(range.startContainer,range.startOffset);const piece=local.cloneContents();piece.querySelectorAll('button,[data-ui]').forEach(x=>x.remove());visibleLength=clean(piece.textContent).length}
    const raw=getBlockText(block.dataset.block)?.slice(start);let offset=visibleLength;
    if(raw!==undefined&&raw!==null){let visible=0;offset=0;const omitted=n=>source?.omissions?.some(o=>n>=o.start&&n<o.end);while(offset<raw.length&&visible<visibleLength){if(raw[offset]!=='\u00ad'&&!omitted(start+offset))visible++;offset++}while(raw[offset]==='\u00ad'||omitted(start+offset))offset++}
    selected={...getLocation(),anchor:{id:block.dataset.block,offset:start+offset},quote};
    $('selection-note').hidden=false;
  }
  document.addEventListener('selectionchange',selectionChanged);
  document.addEventListener('readerpagechange',()=>{selected=null;$('selection-note').hidden=true});
  window.addEventListener('storage',e=>{if(e.key===storageKey){updateCount();if($('notes').open)renderList()}});
  updateCount();
}

// Supplemental files live in the reading sequence, before credits and back cover.
const materialPages=new Map();
function setMaterialLink(link,material){
 if(material.appendixId){link.href='#'+material.appendixId;link.dataset.materialId=material.id;link.removeAttribute('download');link.removeAttribute('target');}
 else if(material.asset){link.href=embeddedAssets[material.asset];link.download=material.id+'.pdf';}
 else {link.href=material.url;link.target='_blank';link.rel='noopener noreferrer';}
}
function visitMaterial(id){
 const material=data.materials.find(m=>m.id===id);if(!material)return;if(!material.appendixId){const link=document.createElement('a');setMaterialLink(link,material);link.click();return}
 if(sourceNumber(pages[index]?.source)<=254)rememberReading();
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 const at=pages.findIndex(p=>p.id===material.appendixId);if(at>=0){go(at);viewport.focus({preventScroll:true});}
}
function visitAppendix(){
 if(sourceNumber(pages[index]?.source)<=254)rememberReading();
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 const at=pages.findIndex(p=>p.parts?.some(p=>p.id==='appendix-title'));if(at>=0)go(at);
}
function materialPreview(material,n){
 const image=material.previews?.[n];
 if(image)return {...image,src:embeddedAssets[image.src]||image.src};
 return data.sections.find(s=>s.id===material.previewSection)?.image;
}
function renderMaterialPage(el,page){
 el.className='page material-page';el.dataset.materialPage=page.materialId;
 const material=data.materials.find(m=>m.id===page.materialId),number=materialPages.get(material.id)||0;
 const title=document.createElement('h2');title.textContent=editUIType(material.title);el.append(title);
 const meta=document.createElement('p');meta.className='material-meta';meta.textContent=editUIType(material.materialKind==='pdf'?'PDF · '+material.previews.length+' стр.':'Интерактивная доска Holst');el.append(meta);
 const image=materialPreview(material,number),preview=document.createElement('button');preview.type='button';preview.className='material-preview';
 if(image){
  const img=document.createElement('img');img.src=image.src;img.alt=image.alt||material.title;img.draggable=false;preview.append(img);
  preview.setAttribute('aria-label','Увеличить: '+material.title);
  preview.addEventListener('click',()=>openDiagram({title:material.title,image}));el.append(preview);
 }
 if(material.materialKind==='holst'){
  const hint=document.createElement('p');hint.className='material-meta';hint.textContent=editUIType(image?'Пример из книги. Редактируемый шаблон доступен на доске.':'Редактируемый шаблон доступен на доске.');el.append(hint);
 }
 if(material.previews?.length>1){
  const paging=document.createElement('nav');paging.className='material-paging';paging.setAttribute('aria-label','Страницы PDF');
  const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
  prev.type=next.type='button';prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label','Предыдущая страница PDF');next.setAttribute('aria-label','Следующая страница PDF');
  prev.disabled=number===0;next.disabled=number===material.previews.length-1;label.textContent=(number+1)+' / '+material.previews.length;label.setAttribute('aria-live','polite');
  prev.addEventListener('click',()=>{materialPages.set(material.id,number-1);render();});next.addEventListener('click',()=>{materialPages.set(material.id,number+1);render();});
  paging.append(prev,label,next);el.append(paging);
 }
 const actions=document.createElement('div');actions.className='material-actions';
 if(image){const enlarge=document.createElement('button');enlarge.type='button';enlarge.textContent='Увеличить';enlarge.addEventListener('click',()=>preview.click());actions.append(enlarge);}
 const download=document.createElement('a');
 if(material.asset){download.textContent='Скачать PDF';download.href=embeddedAssets[material.asset];download.download=material.title+'.pdf';}
 else{download.textContent='Открыть доску ↗';download.href=material.url;download.target='_blank';download.rel='noopener noreferrer';}
 actions.append(download);
 const contents=document.createElement('button');contents.type='button';contents.textContent='Все материалы';contents.addEventListener('click',visitAppendix);actions.append(contents);
 el.append(actions);
 if(returnStack.length){const back=document.createElement('button');back.type='button';back.className='material-return';back.textContent='Вернуться к\u00a0чтению';back.addEventListener('click',returnToReading);el.append(back);}
}
function installMaterialNavigation(){
 const button=document.createElement('button');button.type='button';button.textContent='Скачать шаблон «Пирамида»';button.id='appendix-open';button.addEventListener('click',()=>visitMaterial('brand-pyramid'));button.className='text-button';document.querySelector('.menu-actions').append(button);
 document.addEventListener('click',e=>{const link=e.target.closest('[data-material-id]');if(!link||editActive&&viewport.contains(link))return;e.preventDefault();e.stopImmediatePropagation();visitMaterial(link.dataset.materialId);},true);
}


const editActive=false;
let editUnits=[],editMap=new Map(),editBaseOrder=[];
function editBatchId(id){return editorRegistry[id]?.batch||bookBatch.id}
function editBatchFor(id){return {order:editBaseOrder.filter(bid=>editBatchId(bid)===id),joinSources:false,preserveSourceBreaks:false}}
function editBatch(){return editBatchFor(bookBatch.id)}
function makeEditUnits(content){
  const units=[];
  const blocks=new Map(content.blocks.map(b=>[b.id,b]));
  for(const s of content.sections){
    if(s.type==='text'){
      s.blocks.forEach((id,i)=>units.push({...blocks.get(id),kind:'text',source:blocks.get(id).source??s.source,sourceBreak:i===0}));
      if(s.artwork)units.push({id:'artwork-'+s.id,type:'image',kind:'image',source:s.source,image:s.artwork,inline:true,text:'',sourceBreak:false});
    }else if(s.type==='material')units.push({...s,kind:'material',text:'',sourceBreak:true});else units.push({...s,kind:s.type==='illustration'||s.zoomEnabled===false?'image':'diagram',inlineDiagram:s.type==='diagram'&&s.zoomEnabled===false,text:'',sourceBreak:true});
  }
  return units;
}

function editInit(content){editUnits=makeEditUnits(content);editMap=new Map(editUnits.map(u=>[u.id,u]));editBaseOrder=editUnits.map(u=>u.id)}
function editPatch(){return {}}
function editBlock(id){const u=editMap.get(id)||data?.blocks.find(b=>b.id===id);if(!u)return null;const p={...u.layoutDefaults};return {...u,layout:p,...(u.kind==='image'?{inline:p.placement==='inline'||(p.placement!=='page'&&u.inline)}:{})}}
function editGap(block,spacing=1){return block.layout?.before===undefined?font*.65*spacing:font*block.layout.before*spacing}
function editElement(el,block,start,end){
  const p=block.layout||{};el.dataset.editId=block.id;
  if(p.align)el.style.textAlign=p.align;
  if(p.lineHeight)el.style.lineHeight=p.lineHeight;
  if(p.tracking)el.style.letterSpacing=p.tracking+'em';
  if(p.indent&&start===0)el.style.textIndent=p.indent+'em';
  if(p.after&&end===block.text.length)el.style.paddingBottom=p.after+'em';
  el.style.marginTop='0';
  return el;
}
function editImageFragment(block,width,height,imageHeight){
  const frame=document.createElement('figure');frame.className='edit-flow-image';frame.dataset.block=block.id;frame.dataset.editId=block.id;frame.dataset.start='0';frame.dataset.end='0';
  if(block.inlineDiagram){frame.classList.add('inline-diagram');if(block.intro){const intro=document.createElement('figcaption');intro.className='inline-diagram-intro';intro.textContent=block.intro;frame.append(intro)}}
  const p=block.layout||{},scale=(p.scale||100)/100,img=document.createElement('img');if(!measuring)img.src=block.image.src;img.alt=block.image.alt||'';img.draggable=false;
  const captionLimit=Math.max(44,height*.3),extra=(block.intro?font*1.48*Math.ceil(block.intro.length/(width/font*1.7))+8:0)+(block.material?48:0)+(block.resourceBlocks?.length?48:0)+(block.zoomOnTap?48:0)+(p.caption?captionLimit+16:0);
  const h=Math.max(20,Math.min(imageHeight??Infinity,height-extra-8,width*scale*block.image.height/block.image.width,(block.inlineDiagram?height*.78:block.inline?260:height)*scale));
  img.style.height=h+'px';img.style.width=Math.min(width*scale,h*block.image.width/block.image.height)+'px';img.style.objectPosition=(p.align||'center')+' center';img.dataset.imageHeight=String(h);
  img.addEventListener('error',()=>{if(frame.querySelector('.image-retry'))return;const retry=document.createElement('button');retry.className='image-retry';retry.textContent='Повторить загрузку изображения';frame.style.position='relative';retry.style.cssText='position:absolute;left:0;right:0;top:'+Math.max(0,img.offsetTop+h/2-22)+'px;max-width:100%;background:var(--paper,#fff)';retry.addEventListener('click',()=>{if(block.image.readingAssetError){save();location.reload()}else{retry.remove();img.src=block.image.src}});frame.append(retry)});
  if(p.align==='left')img.style.marginRight='auto';else if(p.align==='right')img.style.marginLeft='auto';else img.style.marginInline='auto';frame.append(img);
  if(block.zoomOnTap){frame.classList.add('zoomable-figure');img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Увеличить: '+block.title);const show=e=>{if(editActive)return;e.preventDefault();e.stopPropagation();openDiagram(block)};img.addEventListener('click',show);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')show(e)});const zoomButton=document.createElement('button');zoomButton.type='button';zoomButton.className='figure-enlarge';zoomButton.textContent='Увеличить схему';zoomButton.addEventListener('click',show);frame.append(zoomButton);}
  if(block.material){const material=document.createElement('div');material.className='material';const download=document.createElement('button');download.className='material-download';download.textContent='Пирамида';download.setAttribute('aria-label','Открыть материал «Пирамида»');download.addEventListener('click',()=>visitMaterial('brand-pyramid'));material.append(download);frame.append(material)}
  if(block.resourceBlocks?.length){const links=document.createElement('div');links.className='diagram-resources';for(const id of block.resourceBlocks){const resource=editBlock(id);if(resource)links.append(sourceFragment(resource))}frame.append(links)}
  if(p.caption){const caption=document.createElement('figcaption');caption.textContent=p.caption;caption.style.maxHeight=captionLimit+'px';caption.style.overflow='auto';frame.append(caption)}
  return frame;
}
function editTextFragment(block,start=0,end=block.text.length){
  const boundaries=(block.layout?.paragraphs||[]).filter(n=>n>start&&n<end);
  if(!boundaries.length)return editElement(sourceFragment(block,start,end),block,start,end);
  const shell=sourceFragment(block,start,start);shell.replaceChildren();shell.style.display='block';
  const stops=[start,...boundaries,end];for(let i=0;i<stops.length-1;i++){const row=document.createElement('span');row.className='edit-paragraph';row.append(...sourceFragment(block,stops[i],stops[i+1]).childNodes);shell.append(row)}
  shell.dataset.end=end;return editElement(shell,block,start,end);
}
function editSegments(){
 const result=[],order=continuousBook?bookCatalogue.flatMap(b=>editBatchFor(b.id).order):editBatch().order;let buffer=[];
 const flush=()=>{if(buffer.length)result.push({blocks:buffer});buffer=[]};
 for(const id of order){const block=editBlock(id),p=block.layout,batch=continuousBook?editBatchFor(editBatchId(id)):editBatch();
  if(block.hiddenFlow)continue;
  const previous=buffer.at(-1),keepPrevious=previous&&(previous.layout?.keepNext??(['h2','comment-title'].includes(previous.type)||block.joinPrevious));
  if(p.breakBefore==='new'||((p.breakBefore==='source'||batch.preserveSourceBreaks)&&p.breakBefore!=='join'&&!batch.joinSources&&block.sourceBreak&&previous?.source!==block.source&&!keepPrevious&&block.type!=='resource'))flush();
  if(block.kind==='diagram'||block.kind==='material'){flush();result.push({page:block});continue}
  if(block.kind==='image'){block.inline=p.placement==='inline'||(p.placement!=='page'&&block.inline);if(!block.inline){flush();result.push({page:{...block,type:'illustration'}});continue}}
  buffer.push(block);
 }
 flush();return result;
}

const editUIType=text=>text.replace(/(^|[\s(])([ВвСсКкУуОоИиАа]|[Нн]а|[Пп]о|[Нн]е|[Нн]и|[Зз]а|[Дд]о|[Ии]з|[Оо]т|[Нн]о|[Дд]ля) /g,'$1$2\u00a0').replace(/ (бы|же|ли)(?=[\s,.!?]|$)/g,'\u00a0$1');
const requestedFragment=new URLSearchParams(location.search).get('fragment');
const fragmentId=bookBatch.id;
let incomingSource=window.craftDemoBridge.initialSource;
let incomingAnchor=new URLSearchParams(location.search).get('anchor');

const $=id=>document.getElementById(id),viewport=$('viewport'),sizes=[12,14,16,18,20,22,24,28,32,36],key=('craft-reader-position-v12-'+personalNamespace)+fragmentId;
const typographyKey=('craft-reader-typography-v2'+personalNamespace),defaultFont=Number(getComputedStyle(document.documentElement).getPropertyValue('--reader-default-size'))||14;
let screenNumbers=null,numberTimer,numberGeneration=0,numberKey='';
let data,pages=[],index=0,font=defaultFont,anchor={id:'',offset:0},resizeTimer,revision=0,selectionGesture=false;
let reflowBusy=false,reflowKey='',fontEpoch=0,lastReflow=null;
const layoutCache=new Map();
let pendingOriginal,viewerAsset,viewerMode,zoom=1,baseWidth=0,activeDiagram,restorePoint;
try{const saved=JSON.parse(localStorage.getItem(key)||(fragmentId==='pyramids'?localStorage.getItem('craft-mobile-v2'):null));if(saved?.font>16&&sizes.includes(saved.font))font=saved.font;if(new URLSearchParams(location.search).get('start')!=='1'&&saved?.anchor&&typeof saved.anchor.id==='string'&&Number.isInteger(saved.anchor.offset))anchor=saved.anchor}catch{}
try{const shared=Number(localStorage.getItem(('craft-reader-font-v12'+personalNamespace))),preference=JSON.parse(localStorage.getItem(typographyKey)||'null');if(shared>16&&sizes.includes(shared))font=shared;if(sizes.includes(preference?.font))font=preference.font}catch{}
function applyTypography(){
 const root=document.documentElement;
 root.style.setProperty('--reader-size',font+'px');
 root.style.setProperty('--reader-heading-size',(font===12?14:Math.min(36,Math.round(font*18/14)))+'px');
 root.style.setProperty('--reader-caption-size',(font===12?10:Math.round(font*12/14))+'px');
}
applyTypography();
const presetSizes=[sizes[Math.max(0,sizes.indexOf(defaultFont)-1)],defaultFont,sizes[Math.min(sizes.length-1,sizes.indexOf(defaultFont)+1)]];
document.querySelectorAll('[data-reading-size]').forEach((button,i)=>{button.dataset.readingSize=presetSizes[i];button.querySelector('small').textContent=presetSizes[i]+' px';});
$('font-reset').textContent='Вернуть '+defaultFont+' px';

const save=()=>{try{localStorage.setItem(key,JSON.stringify({font,anchor}));localStorage.setItem(('craft-reader-font-v12'+personalNamespace),String(font));localStorage.setItem(typographyKey,JSON.stringify({font}))}catch{}};
const blockById=id=>editBlock(id);
const isDialog=()=>Boolean(document.querySelector('dialog[open]'));
function inform(text){$('notice').textContent=text;$('notice').hidden=false;setTimeout(()=>{$('notice').hidden=true},5000)}
async function request(url,options={}){if(url.startsWith('/content'))return new Response(JSON.stringify(embeddedContent),{headers:{'Content-Type':'application/json'}});if(url==='/material/brand-pyramid.pdf')url='/assets/brand-pyramid.pdf';if(embeddedAssets[url])return fetch(embeddedAssets[url]);const control=new AbortController(),timer=setTimeout(()=>control.abort(),9000);try{const response=await fetch(url,{...options,signal:options.signal||control.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response}finally{clearTimeout(timer)}}
function status(container,message,retry){const el=document.createElement('div');el.className='status';el.setAttribute('role','status');el.textContent=message;if(retry){const button=document.createElement('button');button.textContent='Попробовать ещё раз';button.addEventListener('click',retry);el.append(button)}container.replaceChildren(el)}
function capture(){restorePoint={focus:document.activeElement,scroll:viewport.querySelector('.diagram-page')?.scrollTop||0}}
function restore(){const scroller=viewport.querySelector('.diagram-page');if(scroller)scroller.scrollTop=restorePoint?.scroll||0;const target=restorePoint?.focus;if(target?.isConnected&&target.checkVisibility()&&!target.closest('dialog'))target.focus({preventScroll:true});else $('menu-open').focus({preventScroll:true})}
function openMenu(){if(!data||isDialog())return;capture();updateSettings();$('menu').showModal()}
function closeDialog(dialog){dialog.close()}
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog)}});dialog.addEventListener('close',()=>{if(dialog===$('viewer'))cleanupViewer();queueMicrotask(()=>{if(!isDialog())restore()})})});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const targets=[...dialog.querySelectorAll('button:not([disabled]),a[href],textarea,input,select,[tabindex="0"]')].filter(el=>el.checkVisibility());const first=targets[0],last=targets.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}));
$('menu-open').addEventListener('click',openMenu);

function updateSettings(){const at=sizes.indexOf(font);$('font-value').textContent=font+' px';$('font-less').disabled=at===0;$('font-more').disabled=at===sizes.length-1;$('font-reset').disabled=font===defaultFont;document.querySelectorAll('[data-reading-size]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.readingSize)===font)));}
function setFont(value){if(!sizes.includes(value)||value===font)return;font=value;applyTypography();save();updateSettings();reflow()}
$('font-less').addEventListener('click',()=>setFont(sizes[sizes.indexOf(font)-1]));$('font-more').addEventListener('click',()=>setFont(sizes[sizes.indexOf(font)+1]));$('font-reset').addEventListener('click',()=>setFont(defaultFont));
document.querySelectorAll('[data-reading-size]').forEach(button=>button.addEventListener('click',()=>setFont(Number(button.dataset.readingSize))));

function visibleAnchor(point){const u=fullBook.blocks.find(b=>b.id===point.id)||fullBook.sections.find(s=>s.id===point.id)||editMap.get(point.id);const range=u?.anchorRanges?.find(r=>point.offset>=r.start&&point.offset<=r.end);if(range)return {id:range.id,offset:range.offset+Math.max(0,point.offset-range.start)};return u?.flowAlias?{id:u.flowAlias.id,offset:u.anchorOffsets?.[point.offset]??(u.anchorDelta!==undefined?point.offset+u.anchorDelta:u.flowAlias.offset)}:u?.tableAlias?{id:u.tableAlias,offset:0}:point}
function anchorFile(point){if(continuousBook)return bookBatch.file;const target=visibleAnchor(point),unit=fullBook.blocks.find(b=>b.id===target.id)||fullBook.sections.find(s=>s.id===target.id);return unit?bookFileFor(sourceNumber(unit.source)):bookBatch.file}
function anchorPage(){
  if(incomingAnchor){const {id,offset}=visibleAnchor({id:incomingAnchor,offset:Number(new URLSearchParams(location.search).get('offset'))||0});incomingAnchor=null;const at=pages.findIndex(p=>p.parts?p.parts.some(part=>part.id===id&&offset>=part.start&&(offset<part.end||part.start===part.end)):p.id===id);if(at>=0){anchor={id,offset};incomingSource=null;return at}}
  if(incomingSource){const matches=p=>pageHasSource(p,incomingSource);const at=new URLSearchParams(location.search).get('edge')==='last'?pages.findLastIndex(matches):pages.findIndex(matches);incomingSource=null;if(at>=0){anchor=pageAnchor(pages[at]);return at}}

  anchor=visibleAnchor(anchor);
  const found=pages.findIndex(p=>p.type!=='text'?p.id===anchor.id:p.parts.some(part=>part.id===anchor.id&&anchor.offset>=part.start&&(anchor.offset<part.end||part.start===part.end)));
  if(found<0&&anchor.id.startsWith('illustration-')){const source=Number(anchor.id.slice(13)),art=pages.findIndex(p=>p.source===source&&p.artwork);if(art>=0)return art}
  return found>=0?found:0;
}
function pageAnchor(page){return page.type!=='text'?{id:page.id,offset:0}:{id:page.parts[0].id,offset:page.parts[0].start}}
const yieldLayout=()=>new Promise(resolve=>setTimeout(resolve,0));
function layoutState(busy){
 reflowBusy=busy;viewport.setAttribute('aria-busy',String(busy));viewport.inert=busy;
 for(const id of ['contents-open','notes-open','note-current','appendix-open'])if($(id))$(id).disabled=busy;
 $('font-status').textContent=busy?'Размер изменён. Обновляем страницы…':'Размер сохраняется автоматически. Место чтения не потеряется.';
 if(busy){$('previous').disabled=true;$('next').disabled=true;}
}
function pointMatches(page,point){return page.parts?page.parts.some(p=>p.id===point.id&&point.offset>=p.start&&(point.offset<p.end||p.start===p.end)):page.id===point.id}
async function reflow(){
 if(!data||!viewport.clientWidth||!viewport.clientHeight)return;
 const width=viewport.clientWidth,height=viewport.clientHeight-4,key=[width,height,font,fontEpoch].join(':');
 if(key===reflowKey)return;
 reflowKey=key;const currentRevision=++revision,startedAt=performance.now(),scroll=viewport.querySelector('.diagram-page')?.scrollTop||0;
 const active=()=>currentRevision===revision;
 const commit=composed=>{pages=composed;index=anchorPage();save();layoutState(false);render();const scroller=viewport.querySelector('.diagram-page');if(scroller)scroller.scrollTop=scroll;updateSettings();scheduleScreenNumbers();lastReflow={key,duration:performance.now()-startedAt,pages:pages.length};};
 const cached=layoutCache.get(key);if(cached){commit(cached);return;}
 layoutState(true);
 // Paint the new value and type sample before doing any book measurements.
 await yieldLayout();if(!active())return;
 try{
  const segments=editSegments(),groups=new Array(segments.length),point=visibleAnchor(anchor);
  let focus=segments.findIndex(s=>s.page?s.page.id===point.id:s.blocks.some(b=>b.id===point.id));
  if(incomingSource)focus=segments.findIndex(s=>s.page?sourceIncludes(s.page.source,incomingSource):s.blocks.some(b=>sourceIncludes(b.source,incomingSource)));
  if(focus<0)focus=0;
  const order=[focus,...segments.keys()].filter((v,i,a)=>a.indexOf(v)===i);
  for(const n of order){
   if(!active())return;
   const segment=segments[n];let group;
   if(segment.page)group=[segment.page];
   else{
    const steps=paginate(segment.blocks,width,height,$('measure'));let step,slice=performance.now();
    do{
     if(!active())return;
     step=steps.next();
     if(!step.done&&performance.now()-slice>=16){await yieldLayout();if(!active())return;slice=performance.now();}
    }while(!step.done);
    group=step.value;
    for(const p of group){p.sources=[...new Set(p.parts.map(part=>editMap.get(part.id).source))];p.source=p.sources[0];}
   }
   groups[n]=group;
   if(n===focus){const page=group.find(p=>pointMatches(p,point))||group[0];if(page){render(page,true);lastReflow={key,previewMs:performance.now()-startedAt};}}
   await yieldLayout();
  }
  if(!active())return;
  const composed=groups.flat();layoutCache.set(key,composed);while(layoutCache.size>3)layoutCache.delete(layoutCache.keys().next().value);
  const previewMs=lastReflow?.key===key?lastReflow.previewMs:null;commit(composed);lastReflow.previewMs=previewMs;
 }catch(error){if(!active())return;console.error(error);reflowKey='';layoutState(false);status(viewport,'Не получилось подготовить страницы. Попробуйте ещё раз.',reflow)}
}

function render(page=pages[index],updating=false){
  if(!page)return;
  const el=document.createElement('article');el.className='page '+(page.type==='text'?'text-page':'diagram-page');el.dataset.page=index+1;
  if(page.type==='material'){renderMaterialPage(el,page);}else if(page.type==='text'){
    layoutWidth=viewport.clientWidth;layoutHeight=viewport.clientHeight-4;el.classList.toggle('compact-tables',layoutWidth<font*36||layoutHeight<font*23);el.append(assembledParts(page.parts,page.gapScale));
    if(page.artwork){const frame=document.createElement('figure');frame.className='inline-art';frame.style.height=page.artHeight+'px';loadArtwork(page.artwork,frame);el.append(frame)}
  }else if(page.type==='illustration'&&page.inlineDiagram){
    el.className='page text-page';const width=viewport.clientWidth,height=viewport.clientHeight-4,measure=$('measure');measure.style.width=width+'px';measuring=true;measure.replaceChildren(editImageFragment(page,width,height));measuring=false;const natural=Number(measure.querySelector('img').dataset.imageHeight),excess=Math.max(0,measure.getBoundingClientRect().height-height);measure.replaceChildren();el.append(editImageFragment(page,width,height,Math.max(20,natural-excess-1)));el.dataset.editId=page.id;
  }else if(page.type==='illustration'){
    el.className='page artwork-page';const frame=document.createElement('figure');frame.className='artwork-frame';if(page.backCover){frame.classList.add('back-cover');const link=document.createElement('a');link.href='https://ikraikra.ru';link.textContent='ikraikra.ru';link.setAttribute('aria-label','Перейти на сайт школы ИКРА');frame.append(link)}else loadArtwork(page.image,frame);el.append(frame);el.dataset.editId=page.id;const patch=editPatch(page.id),scale=(patch.scale||100)/100;frame.style.width=(100*scale)+'%';frame.style.maxHeight=(100*scale)+'%';frame.style.alignSelf=patch.align==='left'?'flex-start':patch.align==='right'?'flex-end':'center';if(patch.caption){const caption=document.createElement('p');caption.className='edit-added-caption';caption.textContent=patch.caption;el.append(caption)}
  }
  else{
    el.dataset.diagram=page.id;el.dataset.editId=page.id;el.tabIndex=0;el.setAttribute('aria-label',page.title+'. Схема целиком; для чтения деталей доступно увеличение.');
    if(page.intro){const intro=document.createElement('h2');intro.className='diagram-intro';intro.textContent=page.intro;intro.style.fontWeight='400';el.append(intro);}
    const tools=document.createElement('div');tools.className='diagram-tools';
    const enlarge=document.createElement('button');enlarge.textContent='Увеличить схему ↗';enlarge.addEventListener('click',()=>openDiagram(page));tools.append(enlarge);
    const asset=document.createElement('div');asset.className='diagram-asset';loadDiagramImage(page,asset);el.append(tools,asset);const patch=editPatch(page.id);asset.style.width=(patch.scale||100)+'%';asset.style.marginLeft=patch.align==='left'?'0':'auto';asset.style.marginRight=patch.align==='right'?'0':'auto';if(patch.caption){const caption=document.createElement('p');caption.className='edit-added-caption';caption.textContent=patch.caption;el.append(caption)}
    if(page.regions){const label=document.createElement('label');label.className='region-choice';label.textContent='Открыть фрагмент';const select=document.createElement('select');select.setAttribute('aria-label','Перейти к роли на схеме');fillRegions(select,page);select.addEventListener('change',()=>{if(select.value!==''){openDiagram(page);jumpRegion(Number(select.value));select.value=''}});label.append(select);el.insertBefore(label,asset);const hint=document.createElement('p');hint.className='diagram-hint';hint.textContent='Выберите фрагмент для чтения. Увеличенное изображение можно двигать; мини-карта показывает ваше место.';el.append(hint)}
    if(page.material){
      const material=document.createElement('div');material.className='material';
      const download=document.createElement('button');download.className='material-download';download.textContent='Пирамида';download.setAttribute('aria-label','Открыть материал «Пирамида»');download.addEventListener('click',()=>visitMaterial('brand-pyramid'));
      material.append(download);el.append(material);
    }
    if(page.resourceBlocks?.length){const links=document.createElement('div');links.className='diagram-resources';for(const id of page.resourceBlocks){const resource=blockById(id);if(resource)links.append(sourceFragment(resource))}el.append(links)}
  }
  viewport.replaceChildren(el);$('running-header').textContent=data.headers[String(sourceNumber(page.source))]||'Фиолетовый CRAFT';document.dispatchEvent(new Event('readerpagechange'));if(!updating)window.craftDemoBridge.position(sourceNumber(page.source),index,pages.length);updateScreenLabels();$('previous').disabled=index===0&&!bookBatch.previous;$('next').disabled=false;$('next').setAttribute('aria-label',index===pages.length-1?'Завершить демо':'Следующая страница');
  if(updating){$('progress').textContent='Обновляем страницы…';$('previous').disabled=true;$('next').disabled=true;}
}
function loadArtwork(asset,container){const img=document.createElement('img');img.src=asset.src;img.alt=asset.alt;img.width=asset.width;img.height=asset.height;img.draggable=false;img.addEventListener('error',()=>status(container,'Иллюстрация не загрузилась.',()=>loadArtwork(asset,container)));container.replaceChildren(img)}
function loadDiagramImage(diagram,container){const img=document.createElement('img');img.className='diagram-image';img.src=diagram.image.src;img.alt=diagram.image.alt;img.width=diagram.image.width;img.height=diagram.image.height;img.addEventListener('error',()=>status(container,'Схема не загрузилась. Повторите попытку или откройте оригинал через меню.',()=>{if(diagram.image.readingAssetError){save();location.reload()}else loadDiagramImage(diagram,container)}));if(container!==$('viewer-content'))img.addEventListener('click',()=>openDiagram(diagram));container.replaceChildren(img);if(container===$('viewer-content'))applyZoom()}
function go(target){if(reflowBusy||!pages.length)return;if(target<0&&bookBatch.previous){location.href=bookBatch.previous+'?source='+(bookBatch.start-1)+'&edge=last';return}if(target>=pages.length){window.craftDemoEnd();return}if(target>=pages.length&&bookBatch.next){location.href=bookBatch.next+'?source='+(bookBatch.end+1);return}target=Math.min(pages.length-1,Math.max(0,target));if(target===index)return;index=target;anchor=pageAnchor(pages[index]);save();render()}
$('previous').addEventListener('click',()=>go(index-1));$('next').addEventListener('click',()=>go(index+1));
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,a')||isDialog()||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!data)return;if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='PageDown'||e.key===' '){e.preventDefault();go(index+1)}if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();go(index-1)}});
viewport.addEventListener('click',e=>{if(editActive)return;
  const inherited=e.target.closest('[data-inherited-cell]');if(inherited){for(const b of fullBook.blocks)for(const row of b.table?.rows||[]){const cell=row.cells?.find(c=>c.id===inherited.dataset.inheritedCell);if(cell){capture();$('note-title').textContent='Значение объединённой ячейки';const copy=document.createElement('p');richText(copy,{...b,references:[]},cell.start,cell.end);$('note-content').replaceChildren(copy);$('note').showModal();return}}return}
  const footnote=e.target.closest('[data-footnote]');if(footnote){capture();$('note-title').textContent='Сноска '+footnote.dataset.label;$('note-content').replaceChildren(sourceFragment(blockById(footnote.dataset.footnote)));$('note').showModal();return}
  const comment=e.target.closest('[data-comment]');if(comment){rememberReading();const target=pages.findIndex(p=>p.parts?.some(part=>part.id===comment.dataset.comment));if(target>=0){go(target);viewport.querySelector('[data-block="'+comment.dataset.comment+'"]')?.scrollIntoView({block:'nearest'})}return}
  const link=e.target.closest('[data-source-link]');if(link){e.preventDefault();if(Number(link.dataset.sourceLink)<16||Number(link.dataset.sourceLink)>25){window.craftDemoEnd(true);return}if(link.dataset.sourceAnchor){rememberReading();anchor={id:link.dataset.sourceAnchor,offset:0};index=anchorPage();render();save()}else visitSource(Number(link.dataset.sourceLink));return}
  if(e.target.closest('.inline-art,.artwork-frame'))return;
  if(e.target.closest('[data-note]')){capture();$('note-content').replaceChildren(fragment(blockById('framework-note')));$('note').showModal();return}if(e.target.closest('button,a,svg,.legend,.material')||selectionGesture||getSelection()?.toString())return;openMenu()});
let gesture=null,activePointers=new Set();
viewport.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);selectionGesture=Boolean(getSelection()?.toString());if(activePointers.size>1){gesture=null;selectionGesture=true;return}if(e.target.closest('button,a')||e.pointerType==='mouse')return;gesture={x:e.clientX,y:e.clientY,t:performance.now(),pointer:e.pointerId}});
viewport.addEventListener('pointermove',e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10)selectionGesture=true});
viewport.addEventListener('pointerup',e=>{activePointers.delete(e.pointerId);if(!gesture||isDialog()||editActive)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y,dt=performance.now()-gesture.t;gesture=null;if(Math.abs(dx)>22&&Math.abs(dx)>Math.abs(dy)*1.3&&dt<1200&&!getSelection()?.toString()){selectionGesture=true;go(index+(dx<0?1:-1))}setTimeout(()=>selectionGesture=false,80)});
viewport.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);gesture=null;selectionGesture=true});

async function downloadMaterial(button,container){
  if(button.disabled)return;button.disabled=true;button.textContent='Загружаем PDF…';container.querySelector('.error')?.remove();
  try{const response=await request('/material/brand-pyramid.pdf');const blob=await response.blob();if(!blob.size||!response.headers.get('content-type')?.includes('pdf'))throw new Error('Некорректный PDF');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='brand-pyramid.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);button.textContent='Можно кликнуть и скачать'}
  catch{const error=document.createElement('p');error.className='error';error.setAttribute('role','status');error.textContent='Шаблон не загрузился. Проверьте соединение и повторите.';container.append(error);button.textContent='Повторить загрузку PDF'}finally{button.disabled=false}
}

function cleanupViewer(){pendingOriginal?.abort();pendingOriginal=null;if(viewerAsset)URL.revokeObjectURL(viewerAsset);viewerAsset=null;$('viewer-content').replaceChildren();activeDiagram=null;viewerPointers.clear();$('diagram-navigation').hidden=true;$('mini-map').hidden=true}
function initViewer(title,mode){viewerMode=mode;$('viewer-title').textContent=title;zoom=1;$('viewer-content').scrollTo(0,0);$('viewer').showModal()}
function fitWidth(width,height){return Math.min($('viewer-content').clientWidth-4,($('viewer-content').clientHeight-4)*width/height)}
function openDiagram(diagram){capture();initViewer(diagram.title,'diagram');activeDiagram=diagram;$('diagram-navigation').hidden=!diagram.regions;$('mini-map').hidden=!diagram.regions;if(diagram.regions){fillRegions($('region-select'),diagram);$('mini-map-img').src=diagram.image.src;$('map-toggle').setAttribute('aria-pressed','true')}baseWidth=fitWidth(diagram.image.width,diagram.image.height);loadDiagramImage(diagram,$('viewer-content'));zoom=diagram.regions?1:2;applyZoom()}
function applyZoom(){const limit=activeDiagram?12:4;zoom=Math.max(1,Math.min(limit,zoom));const box=$('viewer-content'),visual=box.querySelector('svg,img');if(visual){const oldWidth=parseFloat(visual.style.width)||baseWidth,oldHeight=oldWidth*(activeDiagram?activeDiagram.image.height/activeDiagram.image.width:visual.naturalHeight/visual.naturalWidth),cx=(box.scrollLeft+box.clientWidth/2)/oldWidth,cy=(box.scrollTop+box.clientHeight/2)/oldHeight;visual.style.width=baseWidth*zoom+'px';visual.style.height='auto';box.scrollTo(cx*baseWidth*zoom-box.clientWidth/2,cy*baseWidth*zoom*oldHeight/oldWidth-box.clientHeight/2)}$('zoom-value').textContent=Math.round(zoom*100)+'%';$('zoom-out').disabled=zoom<=1;$('zoom-in').disabled=zoom>=limit;requestAnimationFrame(updateMap)}
function fillRegions(select,diagram){select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Выберите фрагмент…';select.append(placeholder);diagram.regions.forEach((region,i)=>{const option=document.createElement('option');option.value=i;option.textContent=region.label;select.append(option)})}
function jumpRegion(i){const region=activeDiagram?.regions?.[i];if(!region)return;const box=$('viewer-content');zoom=(box.clientWidth-24)/(baseWidth*region.width);applyZoom();const width=baseWidth*zoom,height=width*activeDiagram.image.height/activeDiagram.image.width;box.scrollTo(Math.max(0,region.x*width-12),Math.max(0,region.y*height-12));$('region-select').value=String(i);requestAnimationFrame(updateMap)}
function updateMap(){if(!activeDiagram?.regions||$('mini-map').hidden)return;const box=$('viewer-content'),width=baseWidth*zoom,height=width*activeDiagram.image.height/activeDiagram.image.width,rect=$('map-window');rect.style.left=box.scrollLeft/width*100+'%';rect.style.top=box.scrollTop/height*100+'%';rect.style.width=Math.min(1,box.clientWidth/width)*100+'%';rect.style.height=Math.min(1,box.clientHeight/height)*100+'%'}
$('region-select').addEventListener('change',e=>{if(e.target.value!=='')jumpRegion(Number(e.target.value))});
$('map-toggle').addEventListener('click',()=>{$('mini-map').hidden=!$('mini-map').hidden;$('map-toggle').setAttribute('aria-pressed',String(!$('mini-map').hidden));updateMap()});
$('viewer-content').addEventListener('scroll',updateMap,{passive:true});
$('mini-map').addEventListener('click',e=>{if(!activeDiagram?.regions)return;const r=e.currentTarget.getBoundingClientRect(),box=$('viewer-content'),width=baseWidth*zoom,height=width*activeDiagram.image.height/activeDiagram.image.width;const x=e.detail?(e.clientX-r.left)/r.width:.5,y=e.detail?(e.clientY-r.top)/r.height:.5;box.scrollTo(x*width-box.clientWidth/2,y*height-box.clientHeight/2)});
$('zoom-in').addEventListener('click',()=>{zoom*=1.25;applyZoom()});$('zoom-out').addEventListener('click',()=>{zoom/=1.25;applyZoom()});$('zoom-fit').addEventListener('click',()=>{zoom=1;applyZoom();$('viewer-content').scrollTo(0,0)});
$('viewer-content').addEventListener('keydown',e=>{const box=$('viewer-content');const map={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};if(map[e.key]){e.preventDefault();box.scrollBy(...map[e.key])}if(e.key==='+'||e.key==='='){e.preventDefault();zoom+=.25;applyZoom()}if(e.key==='-'){e.preventDefault();zoom-=.25;applyZoom()}});
const viewerPointers=new Map();let pinchStart,dragStart;
$('viewer-content').addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||!e.currentTarget.querySelector('svg,img')||(!e.isPrimary&&e.pointerType==='mouse'))return;viewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});e.currentTarget.setPointerCapture(e.pointerId);if(viewerPointers.size===1)dragStart={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};if(viewerPointers.size===2){const [a,b]=[...viewerPointers.values()];pinchStart={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};dragStart=null}});
$('viewer-content').addEventListener('pointermove',e=>{if(!viewerPointers.has(e.pointerId))return;viewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(viewerPointers.size===2&&pinchStart){const [a,b]=[...viewerPointers.values()];zoom=pinchStart.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinchStart.distance;applyZoom()}else if(viewerPointers.size===1&&dragStart){e.currentTarget.scrollTo(dragStart.left+dragStart.x-e.clientX,dragStart.top+dragStart.y-e.clientY)}});
function endPointer(e){viewerPointers.delete(e.pointerId);pinchStart=null;dragStart=null} $('viewer-content').addEventListener('pointerup',endPointer);$('viewer-content').addEventListener('pointercancel',endPointer);

new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{reflow();if($('viewer').open&&viewerMode==='diagram'&&activeDiagram){baseWidth=fitWidth(activeDiagram.image.width,activeDiagram.image.height);applyZoom()}},100)}).observe(viewport);
document.fonts.addEventListener('loadingdone',()=>{fontEpoch++;reflow()});
document.fonts.addEventListener('loadingerror',()=>{inform('Шрифт не загрузился — используем запасной. Текст доступен.');reflow()});
async function load(){
  status(viewport,'Открываем книгу…');$('previous').disabled=true;$('next').disabled=true;
  const requested=incomingAnchor?{id:incomingAnchor,offset:Number(new URLSearchParams(location.search).get('offset'))||0}:anchor;
  if(requested?.id&&anchorFile(requested)!==bookBatch.file){const target=visibleAnchor(requested);location.replace(anchorFile(requested)+'?anchor='+encodeURIComponent(target.id)+'&offset='+target.offset);return}
  if(!continuousBook&&incomingSource===2&&bookBatch.start!==241){location.replace(bookFileFor(2)+'?source=2');return}
  try{const response=await request(fragmentId==='opening'?'/content.json':'/content-'+fragmentId+'.json'),loaded=await response.json();if(!Array.isArray(loaded.blocks)||!Array.isArray(loaded.sourcePages)||(!loaded.blocks.length&&!loaded.sections?.length))throw new Error('Некорректный фрагмент');data=loaded;editInit(data);document.querySelector('.book-meta').textContent='Демоверсия · страницы 16–25';document.querySelector('.pilot-note').textContent='Число экранных страниц зависит от размера окна и настроек текста.';
    const target=blockById(anchor.id);if(target){anchor.offset=Math.max(0,Math.min(target.text.length-1,anchor.offset))}else if(![...(data.diagrams||[]),...(data.sections||[])].some(d=>d.id===anchor.id||d.artwork&&'illustration-'+d.source===anchor.id))anchor={id:data.sections?.[0].id||data.blocks[0].id,offset:0};
    await Promise.race([document.fonts.load('18px Onest'),new Promise(resolve=>setTimeout(resolve,800))]).catch(()=>{});reflow();save();
  }catch(error){console.error(error);status(viewport,'Не удалось загрузить текст. Проверьте соединение и повторите попытку.',load)}
}
// Read-only diagnostics for local acceptance: no access to unrelated book pages.
window.readerDiagnostics=()=>({screenNumbers:screenNumbers?structuredClone(screenNumbers):null,font,index,anchor:{...anchor},pages:structuredClone(pages),width:viewport.clientWidth,height:viewport.clientHeight,revision,reflowBusy,lastReflow:structuredClone(lastReflow),sourcePages:data?.sourcePages,overflow:viewport.querySelector('.text-page')?viewport.querySelector('.text-page').scrollHeight>viewport.clientHeight:false});
setupNotes({fragmentId,viewport,inform,capture,isDialog,getBlockText:id=>blockById(id)?.text,getBlock:id=>blockById(id),getLocation:()=>({fragmentId,anchor:{...anchor},source:pages[index]?.source||1}),navigate:point=>{rememberReading();anchor={...point.anchor};save();index=anchorPage();render()}});
installBookControls();
installMaterialNavigation();

load();


function pageHasSource(page,source){return page.aliases?.includes(source)||(page.sources||[page.source]).some(s=>sourceIncludes(s,source))}
function sourceNumber(source){return Number(String(source).split('–')[0])}
function sourceIncludes(source,target){const parts=String(source).split('–').map(Number);return target>=parts[0]&&target<=(parts[1]||parts[0])}
function bookFileFor(source){if(continuousBook)return bookBatch.file;if(source===2)return bookCatalogue.at(-1).file;return bookCatalogue.find(b=>source>=b.start&&source<=b.end)?.file||bookCatalogue[0].file}
function visitSource(source){if(source<16||source>25){window.craftDemoEnd(true);return}rememberReading();const at=pages.findIndex(p=>pageHasSource(p,source));if(at>=0){$('menu').close();go(at)}else location.href=bookFileFor(source)+'?source='+source}
function installBookControls(){
 
 $('contents-open').addEventListener('click',()=>{$('menu').close();$('demo-contents').showModal()});
 for(const item of fullBook.toc){const button=document.createElement('button');button.type='button';button.textContent=item.title;button.addEventListener('click',()=>{rememberReading();$('demo-contents').close();if(item.anchor){anchor={id:item.anchor,offset:0};index=anchorPage();save();render()}else visitSource(item.page);viewport.focus({preventScroll:true})});$('demo-toc-list').append(button)}
 window.craftDemoNavigate=source=>{if(!pages.length){incomingSource=source;return}visitSource(source)};

}
function updateScreenLabels(){
 const offset=screenNumbers?.batches?.[bookBatch.id]?.offset;
 $('progress').textContent=offset===undefined?`${index+1} / ${pages.length} · пересчёт…`:`${offset+index+1} / ${screenNumbers.total}`;
 for(const el of document.querySelectorAll('[data-toc-source]'))el.textContent=screenNumbers?.sources?.[el.dataset.tocSource]??'…';
}
function scheduleScreenNumbers(){
 const result={batches:{[bookBatch.id]:{offset:0,count:pages.length}},sources:{},total:pages.length};
 pages.forEach((p,i)=>{for(const source of [...(p.sources||[p.source]),...(p.aliases||[])]){const [a,b]=String(source).split('–').map(Number);for(let n=a;n<=(b||a);n++)result.sources[n]??=i+1}});
 screenNumbers=result;updateScreenLabels();
}
// A semantic reading anchor survives reflow, reload and cross-file excursions.
const returnStorageKey=('craft-reader-return-v12'+personalNamespace);
let returnStack=[];
try{const stored=JSON.parse(sessionStorage.getItem(returnStorageKey)||'[]');if(Array.isArray(stored))returnStack=stored.filter(p=>bookCatalogue.some(b=>b.id===p.batch)&&typeof p.anchor?.id==='string'&&Number.isInteger(p.anchor.offset)).slice(-20)}catch{}
function persistReturn(){try{sessionStorage.setItem(returnStorageKey,JSON.stringify(returnStack))}catch{}updateReturnButton()}
function readingPoint(){return {batch:bookBatch.id,anchor:{...pageAnchor(pages[index])},font,source:pages[index]?.source,edit:editActive}}
function rememberReading(){if(!pages[index])return;const point=readingPoint(),last=returnStack.at(-1);if(last?.batch!==point.batch||last.anchor.id!==point.anchor.id||last.anchor.offset!==point.anchor.offset)returnStack.push(point);if(returnStack.length>20)returnStack.shift();persistReturn()}
function updateReturnButton(){const button=document.getElementById('return-reading');if(button)button.hidden=!returnStack.length}
function returnToReading(){
 const point=returnStack.pop();if(!point)return;persistReturn();
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 const batch=bookCatalogue.find(b=>b.id===point.batch);if(!batch)return;
 if(batch.id!==bookBatch.id){location.href=batch.file+'?anchor='+encodeURIComponent(point.anchor.id)+'&offset='+point.anchor.offset;return}
 anchor=visibleAnchor(point.anchor);save();index=anchorPage();render();viewport.focus({preventScroll:true});
}
function installReadingReturn(){
 const button=document.createElement('button');button.id='return-reading';button.textContent='Вернуться к\u00a0чтению';button.addEventListener('click',returnToReading);document.querySelector('.reading-header').insertBefore(button,$('menu-open'));updateReturnButton();
 for(const id of ['menu','viewer','notes','note']){const dialog=$(id),back=document.createElement('button');back.className='dialog-return';back.textContent='Вернуться к\u00a0чтению';back.addEventListener('click',()=>dialog.close());dialog.append(back)}
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||!pages.length)return;
  const raw=a.getAttribute('href');if(!raw||raw.startsWith('#')||a.dataset.sourceLink)return;
  if(a.download||/^(https?:|mailto:)/.test(raw)||raw==='./index.html'){if(sourceNumber(pages[index]?.source)<=254)rememberReading();if(!a.download&&/^https?:/.test(raw)){a.target='_blank';a.rel='noopener noreferrer'}}
 },true);
}

installReadingReturn();

function notePageLabel(point){const a=visibleAnchor(point),i=pages.findIndex(p=>p.parts?.some(b=>b.id===a.id&&a.offset>=b.start&&a.offset<b.end)||p.id===a.id);return i>=0?'Страница '+(i+1):'Заметка к книге'}

// One wheel gesture turns one page. Native diagram scrolling and browser zoom win.
const wheelPager=new WheelPager();
viewport.addEventListener('wheel',event=>{
 if(event.ctrlKey||event.metaKey||isDialog()||reflowBusy||!data||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
 const scrollable=event.target.closest('.diagram-page');
 if(scrollable&&scrollable.scrollHeight>scrollable.clientHeight+2)return;
 event.preventDefault();
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
 const direction=wheelPager.feed(delta,performance.now());if(direction)go(index+direction);
},{passive:false});
