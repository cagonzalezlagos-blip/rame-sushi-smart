export const CASH_DENOMINATIONS = [20000,10000,5000,2000,1000,500,100,50,10];
export function denominationTotal(counts){
  return CASH_DENOMINATIONS.reduce((total,value)=>{
    const count=Number(counts[value]??0);
    if(!Number.isSafeInteger(count)||count<0)throw new Error('Usa cantidades enteras y positivas.');
    const next=total+value*count;
    if(!Number.isSafeInteger(next)||next>2147483647)throw new Error('El fondo supera el monto permitido.');
    return next;
  },0);
}
export async function renderCashPanel({client,target,profile,format,escape,print,onError,onPOS,isCurrent=()=>true}){
  const {data:sessions,error}=await client.from('cash_sessions').select('*').order('opened_at',{ascending:false}).limit(20);
  if(error)return onError(error);
  if(!isCurrent())return;
  const cash=sessions.find(s=>!s.closed_at),last=sessions[0];let summary=null,responsible='';
  if(cash){
    const [s,p]=await Promise.all([client.from('cash_close_summary').select('*').eq('session_id',cash.id).single(),client.from('profiles').select('full_name').eq('id',cash.opened_by).maybeSingle()]);
    if(s.error)return onError(s.error);summary=s.data;responsible=p.data?.full_name||'Usuario registrado';
  }
  if(!isCurrent())return;
  const date=value=>new Date(value).toLocaleString('es-CL',{timeZone:'America/Santiago'});
  const receipt=()=>`<h2>APERTURA DE CAJA</h2><p>Hora: ${escape(date(cash.opened_at))}</p><p>Responsable: ${escape(responsible)}</p><p>Fondo inicial: ${format(cash.opening_cash)}</p>`;
  target.innerHTML=`<h1>Apertura y cierre de caja</h1>${cash?`<section class="panel"><h2>🟢 Caja abierta</h2><p>Abierta el ${escape(date(cash.opened_at))} por ${escape(responsible)}</p><p><b>Fondo inicial: ${format(cash.opening_cash)}</b></p><p>El fondo inicial es dinero para dar vuelto; no cuenta como venta.</p><div class="actions"><button id="cashGoPOS">Ir a pedidos</button><button id="cashOpeningReceipt" class="quiet">Imprimir apertura</button></div></section><section class="panel"><h2>Movimientos de la jornada</h2><p>Efectivo esperado: ${format(summary.expected_cash)}</p><p>Tarjeta: ${format(summary.card_movements)} · Transferencia: ${format(summary.transfer_movements)}</p><form id="cashMovement"><label>Movimiento<select name="kind"><option value="income">Ingreso</option><option value="expense">Egreso</option></select></label><label>Medio<select name="method"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select></label><label>Monto<input name="amount" type="number" min="1" max="2147483647" step="1" required></label><label>Detalle<input name="description"></label><button>Registrar movimiento</button></form></section><section class="panel"><form id="cashClose"><h2>Cierre de caja</h2><label>Efectivo contado<input name="counted" type="number" min="0" max="2147483647" step="1" required></label><button>Cerrar caja e imprimir</button></form></section>`:`<section class="panel"><h2>⚪ Caja cerrada</h2>${last?`<p>Último cierre: ${escape(date(last.closed_at))}</p>`:''}<form id="cashOpen"><h2>Abrir caja</h2><p>Responsable: <b>${escape(profile.full_name)}</b>. La fecha y hora se registran al confirmar.</p><label>Fondo inicial en efectivo<input name="opening" type="number" min="0" max="2147483647" step="1" required placeholder="Ej.: 50000"></label><details><summary>Contar billetes y monedas (opcional)</summary><p>Ingresa cuántos tienes de cada valor. Luego aplica el total al fondo inicial.</p><div class="cash-count-grid">${CASH_DENOMINATIONS.map(v=>`<label>${format(v)}<input data-denomination="${v}" type="number" min="0" step="1" value="0" inputmode="numeric"></label>`).join('')}</div><p>Total contado: <b id="cashCountTotal">${format(0)}</b></p><button id="cashApplyCount" type="button" class="quiet">Usar este total</button></details><p>Este fondo se incluirá en el efectivo esperado del cierre, sin sumarse a las ventas.</p><button>Abrir caja</button></form></section>`}<section class="panel"><h2>Historial reciente</h2>${sessions.length?sessions.map(s=>`<p>${s.closed_at?'Cerrada':'Abierta'} · ${escape(date(s.opened_at))} · Fondo ${format(s.opening_cash)}${s.closed_at?` · Contado ${format(s.counted_cash)}`:''}</p>`).join(''):'Todavía no hay aperturas.'}</section>`;
  const reload=()=>renderCashPanel({client,target,profile,format,escape,print,onError,onPOS,isCurrent});
  const bind=(id,action)=>{const form=target.querySelector(id);if(!form)return;form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button[type="submit"],button:not([type])');button.disabled=true;try{await action(new FormData(form));}catch(e){onError(e);}finally{button.disabled=false;}};};
  if(cash){
    target.querySelector('#cashGoPOS').onclick=onPOS;
    target.querySelector('#cashOpeningReceipt').onclick=()=>print('Apertura de caja',receipt(),'80mm');
    bind('#cashMovement',async f=>{const r=await client.rpc('cash_movement',{p_session:cash.id,p_kind:f.get('kind'),p_method:f.get('method'),p_amount:Number(f.get('amount')),p_description:f.get('description')});if(r.error)throw r.error;await reload();});
    bind('#cashClose',async f=>{
      // Refresh the balance immediately before closing, so earlier screen totals are not printed.
      const fresh=await client.from('cash_close_summary').select('*').eq('session_id',cash.id).single();if(fresh.error)throw fresh.error;
      const counted=Number(f.get('counted'));const r=await client.rpc('cash_close',{p_session:cash.id,p_counted:counted});if(r.error)throw r.error;
      const s=fresh.data;await reload();print('Cierre de caja',`<h2>CIERRE DE CAJA</h2><p>${escape(date(new Date()))}</p><p>Responsable: ${escape(profile.full_name)}</p><p>Fondo inicial ${format(cash.opening_cash)}</p><p>Efectivo ${format(s.cash_movements)}</p><p>Tarjeta ${format(s.card_movements)}</p><p>Transferencia ${format(s.transfer_movements)}</p><p>Efectivo esperado ${format(s.expected_cash)}</p><p>Contado ${format(counted)}</p><p>Diferencia ${format(counted-s.expected_cash)}</p>`,'A4');
    });
  }else{
    const counts=()=>Object.fromEntries([...target.querySelectorAll('[data-denomination]')].map(input=>[input.dataset.denomination,input.value]));
    target.querySelectorAll('[data-denomination]').forEach(input=>input.oninput=()=>{try{target.querySelector('#cashCountTotal').textContent=format(denominationTotal(counts()));}catch{target.querySelector('#cashCountTotal').textContent='Revisa las cantidades';}});
    target.querySelector('#cashApplyCount').onclick=()=>{try{target.querySelector('[name="opening"]').value=denominationTotal(counts());}catch(e){onError(e);}};
    bind('#cashOpen',async f=>{const r=await client.rpc('cash_open',{p_opening:Number(f.get('opening'))});if(r.error)throw r.error;await reload();});
  }
}
