const money=n=>'$'+Number(n||0).toLocaleString('es-CL');
const METHODS=[['cash','Efectivo'],['card','Tarjeta'],['transfer','Transferencia']];
export function openMixedPayment({order,client,onPaid}){
 const due=Number(order.total)-Number(order.paid_amount||0);
 if(!Number.isSafeInteger(due)||due<=0)return alert('El pedido ya no tiene saldo pendiente');
 const dialog=document.createElement('dialog');dialog.className='catalog-dialog';
 dialog.innerHTML=`<form><h2>Pago mixto · Pedido #${Number(order.daily_number||order.order_number)||''}</h2><p><b>Saldo a cobrar: ${money(due)}</b></p><p>Ingresa cuánto pagará con cada medio. Deja en cero los que no se utilicen.</p>${METHODS.map(([id,label])=>`<label>${label}<input data-method="${id}" type="number" min="0" max="${due}" step="1" inputmode="numeric" value="0" required></label>`).join('')}<p><b>Distribuido: <span data-distributed>${money(0)}</span></b></p><p><b>Restante: <span data-remaining>${money(due)}</span></b></p><p data-error role="alert"></p><div class="actions"><button type="button" data-cancel>Cancelar</button><button type="submit" data-submit disabled>Confirmar pago mixto</button></div></form>`;
 document.body.append(dialog);dialog.onclose=()=>dialog.remove();
 const inputs=[...dialog.querySelectorAll('[data-method]')],submit=dialog.querySelector('[data-submit]'),error=dialog.querySelector('[data-error]');
 const getParts=()=>inputs.map(i=>({method:i.dataset.method,amount:Number(i.value)})).filter(x=>x.amount>0);
 const validate=()=>{const allValid=inputs.every(i=>i.value.trim()!==''&&/^\d+$/.test(i.value)&&Number.isSafeInteger(Number(i.value))&&Number(i.value)>=0&&Number(i.value)<=due);const parts=getParts(),total=parts.reduce((a,x)=>a+x.amount,0);dialog.querySelector('[data-distributed]').textContent=money(total);dialog.querySelector('[data-remaining]').textContent=money(due-total);submit.disabled=!allValid||parts.length<2||total!==due;return !submit.disabled;};
 inputs.forEach(i=>i.addEventListener('input',()=>{error.textContent='';validate();}));
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!validate())return;submit.disabled=true;inputs.forEach(i=>i.disabled=true);error.textContent='Registrando pago...';
 try{const session=await client.from('cash_sessions').select('id').is('closed_at',null).limit(1);if(session.error)throw session.error;if(!session.data?.length)throw Error('Debes abrir caja antes de cobrar');const {error:rpcError}=await client.rpc('staff_record_mixed_order_payment',{p_order:order.id,p_session:session.data[0].id,p_parts:getParts()});if(rpcError)throw rpcError;dialog.close();onPaid();}
 catch(e){error.textContent=e.message||'No se pudo registrar el pago';inputs.forEach(i=>i.disabled=false);validate();}
 };
 dialog.showModal();validate();
}
