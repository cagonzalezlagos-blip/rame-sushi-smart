export const CHANNELS={counter:'Local',pedidosya:'PedidosYa',ubereats:'Uber Eats',whatsapp:'WhatsApp'};
export const PAYMENT_NAMES={cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia'};

export function mapsRoute(destination,origin=''){
  const url=new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');
  url.searchParams.set('destination',destination);
  url.searchParams.set('travelmode','driving');
  if(origin)url.searchParams.set('origin',origin);
  return url.href;
}

export function mapsPosition(lat,lng){
  const url=new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api','1');url.searchParams.set('query',`${lat},${lng}`);
  return url.href;
}

export function payrollEstimate(entry){
  if(!entry.clock_out)return 0;
  const hours=Math.max(0,(Date.parse(entry.clock_out)-Date.parse(entry.clock_in))/3600000-Number(entry.unpaid_break_minutes||0)/60);
  return Math.round(hours*Number(entry.hourly_rate||0));
}

export function financeSummary(orders=[],movements=[],suppliers=[]){
  const channels=Object.fromEntries(Object.keys(CHANNELS).map(key=>[key,{count:0,total:0}]));
  const methods=Object.fromEntries(Object.keys(PAYMENT_NAMES).map(key=>[key,0]));
  const byId=new Map(orders.map(order=>[order.id,order]));
  let sales=0,movementIncome=0,otherExpense=0;
  for(const movement of movements){
    const amount=Math.abs(Number(movement.amount||0));
    if(movement.kind==='income'&&movement.order_id){
      const order=byId.get(movement.order_id),channel=channels[order?.source_channel]||channels.counter;
      channel.count++;channel.total+=amount;sales+=amount;
      if(methods[movement.method]!==undefined)methods[movement.method]+=amount;
    }else if(movement.kind==='income')movementIncome+=amount;
    else if(movement.kind==='expense'&&!movement.supplier_payment_id)otherExpense+=amount;
  }
  const supplierExpense=suppliers.filter(x=>x.status==='paid').reduce((n,x)=>n+Number(x.amount||0),0);
  return {channels,methods,sales,movementIncome,otherExpense,supplierExpense,net:sales+movementIncome-otherExpense-supplierExpense};
}
