import {configuredGroups,validateSelection,pricedUnit,changeCount} from './builder.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money=n=>'$'+Number(n||0).toLocaleString('es-CL');
const promo=p=>/tabla|promoci[oó]n|promo|^\d+\s*(?:hot|rame|mixta|calientes)/i.test(p.name||'');
const handroll=p=>/hand\s*roll/i.test(p.name||'')&&!promo(p);
const change=g=>/cambio/i.test(g.name||'');
const unit=g=>Number(String(g.name).match(/(?:roll|producto|secci[oó]n|handroll)\s*(\d+)/i)?.[1]||0);
const wrap=g=>/envoltura|cobertura/i.test(g.name||'');
const COMMON=['Pollo','Camarón','Camarón furay','Pollo furay','Salmón','Mechada','Kanikama','Palta','Queso','Queso crema','Cebollín','Pepino','Champiñón','Palmito','Pimentón','Aceituna','Vegetal','Nori','Panko','Sésamo','Jamón serrano','Sin ingrediente'];
const splitDescription=p=>String(p.description||'').replace(/\\n/g,'\n').split(/[;\n/]+/).map(s=>s.trim()).filter(Boolean);
const sourceIngredients=(p,g)=>{const n=unit(g),parts=splitDescription(p),text=(n&&parts[n-1]||parts.join(' ')).toLowerCase();const found=COMMON.filter(x=>x!=='Sin ingrediente'&&new RegExp('(^|[^a-záéíóú])'+norm(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-záéíóú]|$)','i').test(norm(text)));return [...new Set([...found,...COMMON])];};
export function openProductBuilder({product:p,groups,options,previous=null,onSave}){
 const isPromo=promo(p),isHandroll=handroll(p);
 const gs=configuredGroups(p.id,groups,options).map(g=>({...g,choices:g.choices.filter(o=>!isHandroll||!wrap(g)||/nori|panko/i.test(o.name))}));
 const selected=Object.fromEntries(gs.map(g=>[g.id,(previous?.options||[]).filter(o=>o.group_id===g.id&&g.choices.some(x=>x.id===o.option_id)).map(o=>o.option_id)]));
 const changes=gs.filter(change),regular=gs.filter(g=>!change(g));
 const origins={};
 const oldNotes=String(previous?.notes||'');
 for(const g of changes)for(const o of g.choices){const marker=`CAMBIO ${g.name}: `;const line=oldNotes.split('; ').find(x=>x.startsWith(marker)&&x.endsWith(' → '+o.name));if(line)origins[o.id]=line.slice(marker.length).split(' → ')[0];}
 let temperature=/caliente\s*\(panko\)/i.test(oldNotes)?'caliente':/fr[ií]o\s*\(nori\)/i.test(oldNotes)?'frio':'';
 let cream=/sin queso crema/i.test(oldNotes)?'no':/con queso crema/i.test(oldNotes)?'si':'';
 let active=0;
 const dlg=document.createElement('dialog');dlg.className='product-builder quick-builder';document.body.append(dlg);dlg.onclose=()=>dlg.remove();
 const optionsHtml=g=>`<div class="choices">${g.choices.map(o=>`<button type="button" class="choice" data-g="${esc(g.id)}" data-o="${esc(o.id)}"><span>${esc(o.name)}</span><b>${o.price_delta?'+'+money(o.price_delta):'Incluido'}</b></button>`).join('')}</div>`;
 const fieldset=g=>`<fieldset class="quick-group"><legend>${esc(g.name)} ${g.min_select?'(obligatorio)':'(opcional)'}</legend>${optionsHtml(g)}</fieldset>`;
 dlg.innerHTML=`<div class="wizard-head"><h2>${esc(p.name)}</h2><button type="button" class="quiet" id="closeFast">✕</button></div>
 ${isHandroll?`<fieldset class="quick-group"><legend>1. Preparación</legend><div class="choices"><button type="button" class="choice" data-temp="frio">❄️ Frío · Nori</button><button type="button" class="choice" data-temp="caliente">🔥 Caliente · Panko</button></div></fieldset><fieldset class="quick-group"><legend>2. Queso crema</legend><div class="choices"><button type="button" class="choice" data-cream="si">Con queso crema</button><button type="button" class="choice" data-cream="no">Sin queso crema</button></div></fieldset>`:''}
 ${regular.map(fieldset).join('')}
 ${isPromo?`<section class="quick-group"><h3>¿El cliente quiere cambios?</h3><p class="muted">Sin cambios: toca «Agregar al pedido». Con cambios: elige el producto y toca los botones. Máximo tres.</p><strong id="fastCount"></strong><div id="fastChanges"></div></section>`:''}
 <details><summary>Observaciones adicionales (opcional)</summary><textarea id="fastNotes" maxlength="500" placeholder="Solo si cocina necesita alguna indicación especial">${esc(oldNotes.replace(/CAMBIO [^;\n]+/g,'').replace(/(?:fr[ií]o\s*\(nori\)|caliente\s*\(panko\)|con queso crema|sin queso crema)\s*[;,.]?/ig,'').trim())}</textarea></details>
 <p id="fastError" role="alert" class="quick-error"></p><div class="wizard-actions"><strong id="fastPrice"></strong><button type="button" id="fastSave">${previous?'Guardar cambios':'Agregar al pedido'}</button></div>`;
 const error=s=>dlg.querySelector('#fastError').textContent=s;
 const makeNotes=()=>{const lines=[];if(isHandroll){lines.push(temperature==='frio'?'Frío (nori)':'Caliente (panko)',cream==='no'?'Sin queso crema':'Con queso crema');}for(const g of changes)for(const id of selected[g.id]){const o=g.choices.find(o=>o.id===id);lines.push(`CAMBIO ${g.name}: ${origins[id]||'SIN INDICAR'} → ${o.name}`);}lines.push(dlg.querySelector('#fastNotes').value.trim());return lines.filter(Boolean).join('; ').slice(0,500);};
 const paint=()=>{
  dlg.querySelectorAll('[data-g]').forEach(b=>{const yes=selected[b.dataset.g]?.map(String).includes(b.dataset.o);b.classList.toggle('chosen',!!yes);b.setAttribute('aria-pressed',String(!!yes));});
  dlg.querySelectorAll('[data-temp]').forEach(b=>b.classList.toggle('chosen',b.dataset.temp===temperature));dlg.querySelectorAll('[data-cream]').forEach(b=>b.classList.toggle('chosen',b.dataset.cream===cream));
  if(isPromo){dlg.querySelector('#fastCount').textContent=`${changeCount(gs,selected)} de 3 cambios utilizados`;
   const target=dlg.querySelector('#fastChanges');const units=[...new Set(changes.map(unit))].sort((a,b)=>a-b);
   const groupSet=units.length?units:[0];
   target.innerHTML=groupSet.map((u,i)=>{const unitGroups=changes.filter(g=>unit(g)===u);const isTable=/^\d+\s*(?:hot|mixta|calientes?|rame)|tabla/i.test(p.name||'');const label=u?`${isTable?'Roll':'Producto / roll'} ${u}`:'Producto de la promoción';const open=active===i;
    return `<section class="quick-group" style="margin:8px 0"><button type="button" class="quiet" data-unit="${i}" style="width:100%;text-align:left"><b>${esc(label)}</b> ${open?'▴':'▾'} ${unitGroups.reduce((n,g)=>n+selected[g.id].length,0)?'✓':''}</button>${open?unitGroups.map(g=>`<div style="margin:8px 0"><b>${wrap(g)?'Cambiar envoltura':'Cambiar relleno'}</b>${optionsHtml(g)}${selected[g.id].map(id=>`<label>Ingrediente que sale<select data-origin="${esc(id)}"><option value="">Elegir ingrediente original</option>${sourceIngredients(p,g).map(x=>`<option value="${esc(x)}" ${origins[id]===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}</div>`).join(''):''}</section>`;}).join('');
   target.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{active=Number(b.dataset.unit);paint();});
   target.querySelectorAll('[data-origin]').forEach(el=>el.onchange=()=>{origins[el.dataset.origin]=el.value;error('');});
  }
  dlg.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>choose(b.dataset.g,b.dataset.o));
  try{dlg.querySelector('#fastPrice').textContent='Total: '+money(pricedUnit(p,gs,selected,makeNotes()).price);}catch(e){dlg.querySelector('#fastPrice').textContent='Completa las opciones obligatorias';}
 };
 const choose=(groupId,optId)=>{const g=gs.find(g=>String(g.id)===groupId),o=g?.choices.find(o=>String(o.id)===optId);if(!o)return;const ids=selected[g.id],idx=ids.indexOf(o.id);if(idx>=0){ids.splice(idx,1);delete origins[o.id];}else{if(change(g)&&isPromo&&changeCount(gs,selected)>=3){error('Solo se permiten 3 cambios por tabla o promoción.');return;}if(g.max_select===1){for(const id of ids)delete origins[id];selected[g.id]=[o.id];}else if(ids.length<g.max_select)ids.push(o.id);}error('');paint();};
 dlg.querySelector('#closeFast').onclick=()=>dlg.close();
 dlg.querySelectorAll('[data-temp]').forEach(b=>b.onclick=()=>{temperature=b.dataset.temp;paint();});dlg.querySelectorAll('[data-cream]').forEach(b=>b.onclick=()=>{cream=b.dataset.cream;paint();});
 dlg.querySelector('#fastNotes').oninput=()=>{try{dlg.querySelector('#fastPrice').textContent='Total: '+money(pricedUnit(p,gs,selected,makeNotes()).price);}catch{}};
 dlg.querySelector('#fastSave').onclick=()=>{if(isHandroll&&(!temperature||!cream)){error('Selecciona frío/caliente y con/sin queso crema.');return;}const invalid=gs.find(g=>!validateSelection(g,selected[g.id]));if(invalid){error('Completa: '+invalid.name);return;}for(const g of changes)for(const id of selected[g.id])if(!origins[id]){error('Elige con un toque el ingrediente original que sale.');return;}try{const item=pricedUnit(p,gs,selected,makeNotes());if(previous)item.quantity=previous.quantity;onSave(item);dlg.close();}catch(e){error(e.message);}};
 dlg.showModal();paint();
}
