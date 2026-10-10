/* Rame Sushi V8 — mejora progresiva de interfaz, sin alterar cobros ni comandas. */
const $=(root,selector)=>root.querySelector(selector);
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;upgrade();});}
function upgrade(){const view=document.querySelector('#view');if(!view)return;if($('#view','#productSearch'))upgradePOS(view);if($('#view','#orderFilters'))upgradeOrders(view);}
function upgradePOS(view){
 const search=$ (view,'#productSearch'),categories=$(view,'#posCategories'),cols=$(view,'.cols');
 if(!search||!categories||!cols||view.dataset.v8pos==='1')return;
 const sections=cols.querySelectorAll(':scope > section');if(sections.length<2)return;
 const catalogSection=sections[0],orderSection=sections[1];
 view.dataset.v8pos='1';cols.classList.add('v8-pos-layout');
 const quick=document.createElement('section');quick.className='v8-quick-catalog';
 quick.innerHTML='<h2>Agregar productos</h2><p class="v8-muted">Busca un producto, tabla o promoción. Para personalizar ingredientes, selecciónalo y usa sus opciones.</p><div class="v8-shortcuts" role="group" aria-label="Búsquedas rápidas"><button type="button" data-v8term="handroll">Handrolls</button><button type="button" data-v8term="tabla">Tablas</button><button type="button" data-v8term="promo">Promociones</button><button type="button" data-v8term="">Todos</button></div>';
 search.placeholder='Buscar por nombre o ingredientes de la descripción…';search.setAttribute('aria-label','Buscar productos de la carta');
 quick.append(search,categories);orderSection.insertBefore(quick,orderSection.firstChild);
 catalogSection.remove();
 quick.querySelectorAll('[data-v8term]').forEach(b=>b.addEventListener('click',()=>{search.value=b.dataset.v8term;search.dispatchEvent(new Event('input',{bubbles:true}));search.focus();}));
 categories.classList.add('v8-categories');
 const note=document.createElement('p');note.className='v8-muted v8-search-note';note.textContent='Selecciona un resultado para configurar proteína, envoltura y vegetales.';quick.append(note);
 const update=()=>{const term=norm(search.value);quick.classList.toggle('v8-searching',Boolean(term));let visible=0;categories.querySelectorAll('[data-add]').forEach(b=>{if(!b.hidden&&!b.disabled)visible++;});note.textContent=term?(visible?`${visible} productos coincidentes. Haz clic para agregar o personalizar.`:'Sin productos coincidentes. Prueba con otro nombre.'): 'Usa el buscador o abre una categoría para ver la carta.';};
 search.addEventListener('input',()=>queueMicrotask(update));update();
}
let activeKind='pickup';let paymentChoice='';
function upgradeOrders(view){
 const board=$(view,'.orders-board');if(!board)return;
 if(view.dataset.v8orders!=='1'){
  view.dataset.v8orders='1';board.classList.add('v8-orders-board');
  const controls=document.createElement('section');controls.className='v8-order-controls';
  controls.innerHTML='<div class="v8-order-tabs" role="tablist" aria-label="Tipo de pedido"><button type="button" data-v8kind="pickup">🛍 Retiros</button><button type="button" data-v8kind="delivery">🛵 Delivery</button><button type="button" data-v8kind="all">Todos</button></div><label>Medio de pago <select id="v8Payment"><option value="">Todos los medios</option><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option><option value="por confirmar">Sin confirmar</option></select></label><p class="v8-muted" id="v8OrderCount"></p>';
  board.before(controls);
  controls.querySelectorAll('[data-v8kind]').forEach(b=>b.addEventListener('click',()=>{activeKind=b.dataset.v8kind;refreshBoard(view);}));
  controls.querySelector('#v8Payment').value=paymentChoice;
  controls.querySelector('#v8Payment').addEventListener('change',e=>{paymentChoice=e.target.value;refreshBoard(view);});
 }
 board.querySelectorAll('.order-lane article.panel').forEach(card=>{
  if(card.dataset.v8card==='1')return;card.dataset.v8card='1';card.classList.add('v8-order-card');
  const title=card.querySelector(':scope > h2');if(!title)return;
  const detail=document.createElement('div');detail.className='v8-order-detail';detail.hidden=true;
  for(const node of [...card.children])if(node!==title)detail.append(node);
  card.append(detail);title.tabIndex=0;title.setAttribute('role','button');title.setAttribute('aria-expanded','false');title.title='Clic para ver el detalle y las acciones';
  const toggle=()=>{detail.hidden=!detail.hidden;title.setAttribute('aria-expanded',String(!detail.hidden));};
  title.addEventListener('click',toggle);title.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
 });
 refreshBoard(view);
}
function refreshBoard(view){
 const board=$(view,'.orders-board');if(!board)return;
 const tabs=view.querySelectorAll('[data-v8kind]');tabs.forEach(b=>{const selected=b.dataset.v8kind===activeKind;b.classList.toggle('v8-selected',selected);b.setAttribute('aria-selected',String(selected));});
 let total=0;
 board.querySelectorAll('.order-lane').forEach(lane=>{
  const kind=lane.dataset.orderLane;lane.hidden=activeKind!=='all'&&kind!==activeKind;
  let count=0;
  lane.querySelectorAll('.v8-order-card').forEach(card=>{
   const text=norm(card.textContent);const payment=norm(paymentChoice);const match=!payment||text.includes(payment);card.hidden=!match;if(match)count++;
  });total+=lane.hidden?0:count;
  const label=lane.querySelector('h2 .tag');if(label&&label.textContent!==String(count))label.textContent=String(count);
 });
 const summary=$(view,'#v8OrderCount');if(summary){const msg=`${total} pedidos visibles en esta página. Haz clic en un pedido para consultar ingredientes, pago, dirección y acciones.`;if(summary.textContent!==msg)summary.textContent=msg;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});schedule();});
else{new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});schedule();}
