import {configuredGroups,validateSelection,pricedUnit,isIngredientChangeGroup} from './builder.js';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clp=n=>'$'+Number(n||0).toLocaleString('es-CL');
export function openProductBuilder({product:p,groups,options,previous=null,onSave}){
const gs=configuredGroups(p.id,groups,options);
  const selected=Object.fromEntries(gs.map(g=>[g.id,previous?.options.filter(o=>o.group_id===g.id).map(o=>o.option_id)||[]]));
  const d=document.createElement('dialog');d.className='product-builder';document.body.append(d);d.onclose=()=>d.remove();const $=selector=>d.querySelector(selector);let step=0,notes=previous?.notes||'';
  const renderStep=()=>{
    const g=gs[step],last=step===gs.length;
    d.innerHTML=`<div class="wizard-head"><b>${safe(p.name)}</b><button type="button" id="cancel" class="quiet" aria-label="Cerrar">✕</button></div><p class="muted">Paso ${step+1} de ${gs.length+1}</p><div class="progress"><span style="width:${(step+1)/(gs.length+1)*100}%"></span></div>${last?`<h2>Revisa tu producto</h2>${gs.map(x=>`<p><b>${safe(x.name)}:</b> ${selected[x.id].map(id=>safe(x.choices.find(o=>o.id===id)?.name)).join(', ')||'Sin adicional'}</p>`).join('')}<label>Observaciones para cocina<textarea id="unitNotes" maxlength="500" placeholder="Ej.: pollo por palta, sin cebollín, sin salsa">${safe(notes)}</textarea></label><button type="button" id="originalRecipe" class="quiet">Sin cambios / receta original</button><h2 id="unitPrice"></h2>`:`<h2>${safe(g.name)}</h2><p>Elige ${g.min_select===g.max_select?g.min_select:`entre ${g.min_select} y ${g.max_select}`}${g.min_select===0?' (opcional)':''}</p>${g.min_select===0?`<button type="button" id="skipOptional" class="quiet" aria-pressed="${selected[g.id].length===0}">${isIngredientChangeGroup(g)?'Sin cambios / receta original':'Sin adicional'}</button>`:''}<div class="choices">${g.choices.map(o=>`<button type="button" class="choice ${selected[g.id].includes(o.id)?'chosen':''}" data-option="${o.id}" aria-pressed="${selected[g.id].includes(o.id)}"><span>${safe(o.name)}</span><b>${o.price_delta?`+${clp(o.price_delta)}`:'Incluido'}</b></button>`).join('')}</div><p class="muted" id="choiceCount"></p>`}<div class="wizard-actions"><button type="button" id="back" ${step===0?'disabled':''}>Atrás</button><button type="button" id="forward">${last?'Agregar al pedido':'Siguiente'}</button></div>`;
    $('#cancel').onclick=()=>d.close();$('#back').onclick=()=>{if(last)notes=$('#unitNotes').value;if(step>0){step--;renderStep()}};
    if(last){$('#originalRecipe').onclick=()=>{notes='';for(const group of gs)if(isIngredientChangeGroup(group))selected[group.id]=[];renderStep();};$('#unitPrice').textContent='Precio por unidad: '+clp(pricedUnit(p,gs,selected,notes).price)}else{
      if($('#skipOptional'))$('#skipOptional').onclick=()=>{selected[g.id]=[];renderStep();};$('#choiceCount').textContent=`${selected[g.id].length} de ${g.max_select} seleccionados`;
      d.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{let ids=selected[g.id],i=ids.indexOf(b.dataset.option);if(i>=0)ids.splice(i,1);else if(g.max_select===1)selected[g.id]=[b.dataset.option];else if(ids.length<g.max_select)ids.push(b.dataset.option);renderStep()});
    }
    $('#forward').onclick=()=>{if(last){let item=pricedUnit(p,gs,selected,$('#unitNotes').value);if(previous)item.quantity=previous.quantity;onSave(item);d.close();return}if(!validateSelection(g,selected[g.id]))return alert(`Selecciona ${g.min_select===g.max_select?g.min_select:`entre ${g.min_select} y ${g.max_select}`} en ${g.name}`);step++;renderStep()};
  };
  d.showModal();renderStep();

}
