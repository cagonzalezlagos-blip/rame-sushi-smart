export const orderFilterState={period:'current',status:'',payment:'',channel:'',fulfillment:'',search:'',dateFrom:'',dateTo:'',offset:0};
export function santiagoDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function applyOrderFilters(query,state,session){
 if(state.period==='current'){query=session?query.eq('comanda_session_id',session.id):query.eq('order_day',santiagoDay());}
 else if(state.period==='dates'){if(state.dateFrom)query=query.gte('order_day',state.dateFrom);if(state.dateTo)query=query.lte('order_day',state.dateTo);}
 else if(state.period!=='all')query=query.eq('comanda_session_id',state.period);
 for(const [field,column] of [['status','status'],['payment','payment_status'],['channel','source_channel'],['fulfillment','fulfillment']])if(state[field])query=query.eq(column,state[field]);
 if(state.search.trim()){const q=state.search.trim().replace(/[%,()\\_"']/g,' ').slice(0,100);if(q.trim())query=query.or(`customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%${/^\d+$/.test(q)&&Number(q)<=2147483647?`,daily_number.eq.${q}`:''}`);}
 return query;
}
export function orderFilterHTML(sessions,state,esc){
 const options=(items,value)=>items.map(([v,n])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(n)}</option>`).join('');
 return `<form id="orderFilters" class="panel filter-grid"><label>Período<select name="period">${options([['current','Jornada actual / último cierre'],['dates','Rango de fechas'],['all','Todas las jornadas'],...sessions.map(s=>[s.id,new Date(s.opened_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})+(s.closed_at?' · Cerrada':' · Abierta')])],state.period)}</select></label><label>Desde<input type="date" name="dateFrom" value="${esc(state.dateFrom||'')}"></label><label>Hasta<input type="date" name="dateTo" value="${esc(state.dateTo||'')}"></label><label>Estado<select name="status">${options([['','Todos'],['pending','Pendiente'],['confirmed','Confirmado'],['preparing','En cocina'],['ready','Listo'],['assigned','Asignado'],['out_for_delivery','En reparto'],['delivered','Entregado'],['picked_up','Retirado'],['cancelled','Cancelado']],state.status)}</select></label><label>Pago<select name="payment">${options([['','Todos'],['pending','Pendiente'],['paid','Pagado'],['refunded','Devuelto']],state.payment)}</select></label><label>Entrega<select name="fulfillment">${options([['','Todas'],['pickup','Retiro'],['delivery','Delivery']],state.fulfillment)}</select></label><label>Canal<select name="channel">${options([['','Todos'],['counter','Local'],['whatsapp','WhatsApp'],['pedidosya','PedidosYa'],['ubereats','Uber Eats']],state.channel)}</select></label><label>Buscar<input name="search" type="search" value="${esc(state.search)}" maxlength="100" placeholder="Nombre, teléfono o número de comanda"></label><div class="actions"><button>Aplicar filtros</button><button id="resetOrderFilters" type="button" class="quiet">Restablecer jornada actual</button></div></form>`;
}
export function bindOrderFilters(target,state,reload){
 const form=target.querySelector('#orderFilters');
 form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));if(values.period==='dates'&&values.dateFrom&&values.dateTo&&values.dateFrom>values.dateTo){alert('La fecha inicial no puede superar la fecha final.');return;}Object.assign(state,values,{offset:0});reload();};
 target.querySelector('#resetOrderFilters').onclick=()=>{Object.assign(state,{period:'current',status:'',payment:'',channel:'',fulfillment:'',search:'',dateFrom:'',dateTo:'',offset:0});reload();};
 target.querySelector('#ordersPrev').onclick=()=>{state.offset=Math.max(0,state.offset-50);reload();};
 target.querySelector('#ordersNext').onclick=()=>{state.offset+=50;reload();};
}
