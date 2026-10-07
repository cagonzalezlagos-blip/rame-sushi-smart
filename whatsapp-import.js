const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseWhatsApp(text,products){
 const source=String(text).slice(0,15000),lines=source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),matches=[];
 for(const line of lines){const words=' '+norm(line)+' ',found=products.filter(p=>words.includes(' '+norm(p.name)+' ')).sort((a,b)=>b.name.length-a.name.length);if(!found.length)continue;
  // Overlapping catalog names are suggestions only: the cashier chooses in the review.
  const quantity=Number(line.match(/^\s*(\d{1,2})\s*(?:[x×]\s*)?/)?.[1]||1);
  matches.push({product_id:found[0].id,quantity:Math.max(1,Math.min(30,quantity)),notes:line.slice(0,500)});
 }
 const phone=source.match(/(?:\+?56[\s-]*)?9(?:[\s-]*\d){8}(?!\d)/)?.[0]?.replace(/[^+\d]/g,'')||'';
 const name=source.match(/(?:^|\n)\s*(?:nombre|cliente|soy)\s*:?\s*([^\n]{2,150})/i)?.[1]?.trim()||'';
 const address=source.match(/(?:^|\n)\s*(?:direcci[oó]n|domicilio)\s*:\s*([^\n]{6,250})/i)?.[1]?.trim()||'';
 return {name,phone,address,matches,source};
}
export function openWhatsAppImport({products,onImport}){
 const dialog=document.createElement('dialog');dialog.className='catalog-dialog';let parsed=null,rows=[];
 dialog.innerHTML='<h2>Pasar pedido de WhatsApp</h2><p>Copia los mensajes del cliente y pégalos aquí. Revisa los productos y sus cantidades; las sugerencias no se envían a cocina hasta registrar el pedido.</p><label>Mensaje o conversación<textarea id="waText" maxlength="15000" rows="8" placeholder="Nombre: Ana\nTeléfono: +56912345678\n2 Handroll\nDirección: Calle 123, Villa Alemana"></textarea></label><button type="button" id="waAnalyze">Revisar mensaje</button><div id="waReview"></div><p id="waError" role="alert"></p><button type="button" id="waCancel" class="quiet">Cerrar</button>';
 document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.querySelector('#waCancel').onclick=()=>dialog.close();
 const choices=id=>'<option value="">Seleccionar producto</option>'+products.map(p=>`<option value="${p.id}" ${id===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
 function draw(){const target=dialog.querySelector('#waReview');target.innerHTML=`<form id="waImportForm"><h3>Datos para revisar</h3><label>Nombre<input name="name" maxlength="150" value="${esc(parsed.name)}"></label><label>Teléfono<input name="phone" maxlength="25" value="${esc(parsed.phone)}"></label><label>Dirección<input name="address" maxlength="250" value="${esc(parsed.address)}"></label><h3>Productos sugeridos</h3><p>Corrige las coincidencias. Las opciones obligatorias de handroll se eligen después en el borrador.</p>${rows.map((r,i)=>`<fieldset><label>Producto<select data-wa-product="${i}" required>${choices(r.product_id)}</select></label><label>Cantidad<input data-wa-quantity="${i}" type="number" min="1" max="30" step="1" value="${r.quantity}"></label><label>Preparación o cambios<textarea data-wa-notes="${i}" maxlength="500">${esc(r.notes)}</textarea></label><button type="button" data-wa-remove="${i}" class="quiet">Quitar</button></fieldset>`).join('')}<button type="button" id="waAdd" class="quiet">Agregar otro producto</button><p>Los datos y la preparación deben ser revisados por quien toma el pedido.</p><button>Trasladar al borrador actual</button></form>`;
 function capture(){for(let i=0;i<rows.length;i++){rows[i]={product_id:target.querySelector(`[data-wa-product="${i}"]`).value,quantity:Number(target.querySelector(`[data-wa-quantity="${i}"]`).value),notes:target.querySelector(`[data-wa-notes="${i}"]`).value};}const f=target.querySelector('form');parsed.name=f.elements.name.value;parsed.phone=f.elements.phone.value;parsed.address=f.elements.address.value;}
 target.querySelector('#waAdd').onclick=()=>{capture();rows.push({product_id:'',quantity:1,notes:''});draw();};target.querySelectorAll('[data-wa-remove]').forEach(b=>b.onclick=()=>{capture();rows.splice(+b.dataset.waRemove,1);draw();});
 target.querySelector('form').onsubmit=async e=>{e.preventDefault();capture();if(!rows.length){dialog.querySelector('#waError').textContent='Agrega al menos un producto para trasladar.';return;}e.submitter.disabled=true;try{await onImport({...parsed,items:rows});dialog.close();}catch(error){dialog.querySelector('#waError').textContent=error.message;e.submitter.disabled=false;}};
 }
 dialog.querySelector('#waAnalyze').onclick=()=>{parsed=parseWhatsApp(dialog.querySelector('#waText').value,products);rows=parsed.matches.length?parsed.matches:[{product_id:'',quantity:1,notes:''}];draw();};dialog.showModal();
}
