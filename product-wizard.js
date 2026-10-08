import {configuredGroups,validateSelection,pricedUnit,isIngredientChangeGroup} from './builder.js';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clp=n=>'$'+Number(n||0).toLocaleString('es-CL');
export function openProductBuilder({product:p,groups,options,previous=null,onSave}){
 const gs=configuredGroups(p.id,groups,options);
 const selected=Object.fromEntries(gs.map(g=>[g.id,previous?.options?.filter(o=>o.group_id===g.id).map(o=>o.option_id)||[]]));
 const dialog=document.createElement('dialog');dialog.className='product-builder quick-builder';document.body.append(dialog);
 dialog.onclose=()=>dialog.remove();
 dialog.innerHTML=`<div class="wizard-head"><h2>${safe(p.name)}</h2><button type="button" class="quiet" data-close aria-label="Cerrar">✕</button></div><p class="muted">Selecciona los ingredientes. Los grupos obligatorios están señalados.</p><div class="quick-groups">${gs.map(g=>`<fieldset class="quick-group" data-group="${safe(g.id)}"><legend>${safe(g.name)} <small>${g.min_select?`Obligatorio · ${g.min_select===g.max_select?g.min_select:`${g.min_select} a ${g.max_select}`}`:'Opcional'}</small></legend>${g.min_select===0?`<button type="button" class="quiet quick-clear" data-clear="${safe(g.id)}">${isIngredientChangeGroup(g)?'Receta original / sin cambios':'Sin adicional'}</button>`:''}<div class="choices">${g.choices.map(o=>`<button type="button" class="choice" data-group-option="${safe(g.id)}" data-option="${safe(o.id)}" aria-pressed="false"><span>${safe(o.name)}</span><b>${o.price_delta?`+${clp(o.price_delta)}`:'Incluido'}</b></button>`).join('')}</div><small class="quick-count" data-count="${safe(g.id)}"></small></fieldset>`).join('')}</div><label>Observaciones para cocina<textarea id="unitNotes" maxlength="500" placeholder="Ej.: sin cebollín, salsa aparte">${safe(previous?.notes||'')}</textarea></label><p class="quick-error" role="alert" aria-live="polite"></p><div class="wizard-actions"><strong id="unitPrice"></strong><button type="button" data-save>${previous?'Guardar cambios':'Agregar al pedido'}</button></div>`;
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
  if(invalid){dialog.querySelector('.quick-error').textContent=`Revisa ${invalid.name}: selecciona entre ${invalid.min_select} y ${invalid.max_select}.`;dialog.querySelector(`[data-group="${CSS.escape(String(invalid.id))}"]`)?.scrollIntoView({block:'center'});return;}
  const item=pricedUnit(p,gs,selected,dialog.querySelector('#unitNotes').value);if(previous)item.quantity=previous.quantity;onSave(item);dialog.close();
 };
 dialog.showModal();update();
}
