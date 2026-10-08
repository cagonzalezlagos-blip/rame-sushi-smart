import {configuredGroups,validateSelection,pricedUnit,isIngredientChangeGroup} from './builder.js';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clp=n=>'$'+Number(n||0).toLocaleString('es-CL');
export function openProductBuilder({product:p,groups,options,previous=null,onSave}){
 const gs=configuredGroups(p.id,groups,options);
 const selected=Object.fromEntries(gs.map(g=>[g.id,previous?.options?.filter(o=>o.group_id===g.id).map(o=>o.option_id)||[]]));
 const parseUnit=name=>{const m=String(name).match(/^(.*?)(?:\s*[·:-]\s*)(?:Proteína adicional|Proteína|Envoltura|Vegetal(?:es)?|Relleno|Otros?|Salsas?|Extras?)/i);return m?m[1].trim():null;};
 const unitOf=g=>{const match=String(g.name).match(/(?:hand\s*roll|handroll|roll)\s*(?:xl\s*)?(\d+)/i);return match?Number(match[1]):0;};
 const rank=g=>/prote[ií]na(?! adicional)/i.test(g.name)?0:/envoltura|cobertura/i.test(g.name)?1:/vegetal|verdura/i.test(g.name)?2:/prote[ií]na adicional/i.test(g.name)?3:4;
 const isPromo=gs.filter(g=>unitOf(g)>0).length>=2;
 const units=[...new Set(gs.map(unitOf).filter(Boolean))].sort((a,b)=>a-b);
 const orderedGs=isPromo?[...gs].sort((a,b)=>(unitOf(a)||999)-(unitOf(b)||999)||rank(a)-rank(b)||Number(a.sort_order||0)-Number(b.sort_order||0)):gs;
 const shortName=(value,unit)=>String(value).replace(new RegExp('^(?:hand\\s*roll|handroll|roll)\\s*(?:xl\\s*)?'+unit+'\\s*[:·-]\\s*','i'),'').replace(/^(?:Proteína adicional|Proteína|Envoltura|Vegetal(?:es)?)\s*[:·-]\s*/i,'').trim();
 const dialog=document.createElement('dialog');dialog.className='product-builder quick-builder';document.body.append(dialog);
 dialog.onclose=()=>dialog.remove();
 const groupsHtml=orderedGs.map(g=>{const unit=unitOf(g),label=isPromo&&unit?String(g.name).replace(/^.*?\d+\s*[·:-]\s*/,''):g.name;return `<fieldset class="quick-group" data-group="${safe(g.id)}" ${isPromo&&unit?`data-roll="${unit}"`:''}><legend>${safe(label)} <small>${g.min_select?`Elegir ${g.min_select===g.max_select?g.min_select:`${g.min_select}–${g.max_select}`}`:'Opcional'}</small></legend>${g.min_select===0?`<button type="button" class="quiet quick-clear" data-clear="${safe(g.id)}">Sin adicional</button>`:''}<div class="choices">${g.choices.map(o=>`<button type="button" class="choice" data-group-option="${safe(g.id)}" data-option="${safe(o.id)}" aria-pressed="false"><span>${safe(isPromo&&unit?shortName(o.name,unit):o.name)}</span><b>${o.price_delta?`+${clp(o.price_delta)}`:'Incluido'}</b></button>`).join('')}</div><small class="quick-count" data-count="${safe(g.id)}"></small></fieldset>`}).join('');
 dialog.innerHTML=`<div class="wizard-head"><h2>${safe(p.name)}</h2><button type="button" class="quiet" data-close aria-label="Cerrar">✕</button></div>${isPromo?`<nav class="roll-tabs" aria-label="Elegir handroll">${units.map((n,i)=>`<button type="button" class="quiet roll-tab" data-roll-tab="${n}">Handroll ${n}</button>`).join('')}</nav><div class="roll-current" aria-live="polite"></div>`:'<p class="muted">Selecciona los ingredientes. Los grupos obligatorios están señalados.</p>'}<div class="quick-groups ${isPromo?'promo-quick-groups':''}">${groupsHtml}</div><label>Observaciones para cocina<textarea id="unitNotes" maxlength="500" placeholder="Ej.: sin cebollín, salsa aparte">${safe(previous?.notes||'')}</textarea></label><p class="quick-error" role="alert" aria-live="polite"></p><div class="wizard-actions"><strong id="unitPrice"></strong>${isPromo?'<button type="button" class="quiet" data-prev-roll>Anterior</button><button type="button" data-next-roll>Siguiente handroll →</button>':''}<button type="button" data-save>${previous?'Guardar cambios':'Agregar al pedido'}</button></div>`;
 let activeRoll=units[0]||0;
 const showRoll=()=>{if(!isPromo)return;dialog.querySelectorAll('[data-roll]').forEach(el=>{el.hidden=Number(el.dataset.roll)!==activeRoll});dialog.querySelectorAll('[data-roll-tab]').forEach(el=>{el.classList.toggle('selected',Number(el.dataset.rollTab)===activeRoll)});dialog.querySelector('.roll-current').textContent=`Handroll ${activeRoll} de ${units.length}`;dialog.querySelector('[data-prev-roll]').disabled=activeRoll===units[0];dialog.querySelector('[data-next-roll]').hidden=activeRoll===units[units.length-1];dialog.querySelector('[data-save]').hidden=activeRoll!==units[units.length-1];};
 const goRoll=n=>{activeRoll=n;showRoll();dialog.querySelector('.quick-groups').scrollIntoView({block:'nearest'});};
 if(isPromo){dialog.querySelectorAll('[data-roll-tab]').forEach(b=>b.onclick=()=>goRoll(Number(b.dataset.rollTab)));dialog.querySelector('[data-prev-roll]').onclick=()=>goRoll(units[Math.max(0,units.indexOf(activeRoll)-1)]);dialog.querySelector('[data-next-roll]').onclick=()=>{const invalid=orderedGs.find(g=>unitOf(g)===activeRoll&&!validateSelection(g,selected[g.id]));if(invalid){dialog.querySelector('.quick-error').textContent=`Completa ${invalid.name} antes de continuar.`;return;}dialog.querySelector('.quick-error').textContent='';goRoll(units[Math.min(units.length-1,units.indexOf(activeRoll)+1)]);};}
 showRoll();
 const update=()=>{
  for(const g of gs){const chosen=selected[g.id];dialog.querySelectorAll('[data-group-option]').forEach(b=>{if(b.dataset.groupOption!==String(g.id))return;const active=chosen.map(String).includes(b.dataset.option);b.classList.toggle('chosen',active);b.setAttribute('aria-pressed',String(active));});const count=dialog.querySelector(`[data-count="${CSS.escape(String(g.id))}"]`);if(count)count.textContent=`${chosen.length} seleccionados · máximo ${g.max_select}`;}
  dialog.querySelector('#unitPrice').textContent='Precio: '+clp(pricedUnit(p,gs,selected,dialog.querySelector('#unitNotes').value).price);
 };
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{selected[b.dataset.clear]=[];update()});
 dialog.querySelectorAll('[data-group-option]').forEach(b=>b.onclick=()=>{
  const g=gs.find(x=>String(x.id)===b.dataset.groupOption);if(!g)return;
  const ids=selected[g.id],id=g.choices.find(x=>String(x.id)===b.dataset.option)?.id;if(id===undefined)return;
  const index=ids.indexOf(id);if(index>=0)ids.splice(index,1);else if(g.max_select===1)selected[g.id]=[id];else if(ids.length<g.max_select)ids.push(id);
  dialog.querySelector('.quick-error').textContent='';update();
 });
 dialog.querySelector('#unitNotes').addEventListener('input',update);
 dialog.querySelector('[data-save]').onclick=()=>{
  const invalid=gs.find(g=>!validateSelection(g,selected[g.id]));
  if(invalid){dialog.querySelector('.quick-error').textContent=`Revisa ${invalid.name}: selecciona entre ${invalid.min_select} y ${invalid.max_select}.`;if(isPromo&&unitOf(invalid))goRoll(unitOf(invalid));dialog.querySelector(`[data-group="${CSS.escape(String(invalid.id))}"]`)?.scrollIntoView({block:'center'});return;}
  const item=pricedUnit(p,gs,selected,dialog.querySelector('#unitNotes').value);if(previous)item.quantity=previous.quantity;onSave(item);dialog.close();
 };
 dialog.showModal();update();
}
