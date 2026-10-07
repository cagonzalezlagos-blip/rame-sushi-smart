export function kitchenLines(order,job={}){
 const lines=[],add=(text,bold=false,size=12)=>lines.push({text:String(text??''),bold,size});
 const number=order.daily_number?String(order.daily_number).padStart(3,'0'):order.order_number;
 if(job.job_type?.startsWith('correction-'))add('ACTUALIZACIÓN DEL PEDIDO',true,14);
 add('COMANDA #'+number,true,16);
 add(new Date(order.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago'}));
 add(order.fulfillment==='delivery'?'DELIVERY':'RETIRO',true,14);
 add(order.customer_name,true,14);add('Teléfono: '+order.customer_phone);
 if(order.scheduled_at)add('Agendado: '+new Date(order.scheduled_at).toLocaleString('es-CL',{timeZone:'America/Santiago'}),true);
 add('────────────────────');
 for(const item of order.order_items||[]){add(item.quantity+' × '+item.product_name,true,14);for(const option of item.selected_options||[])add(option.name);if(item.notes)add(item.notes,true);add('');}
 add('────────────────────');
 if(order.delivery_address)add('Dirección: '+order.delivery_address,true);
 for(const sauce of order.gift_sauces||[])add('Regalo: '+sauce.quantity+' '+sauce.name,true);
 add('Palitos: '+(order.chopsticks||0)+' pares',true);
 if(order.delivery_notes)add('Repartidor: '+order.delivery_notes,true);
 add('FIN DE COMANDA',true);return lines;
}

export function prebillLines(order){const lines=[],add=(text,bold=false,size=12)=>lines.push({text:String(text),bold,size});const money=n=>'$'+Number(n||0).toLocaleString('es-CL');add('PRE-CUENTA #'+(order.daily_number?String(order.daily_number).padStart(3,'0'):order.order_number),true,16);add(order.customer_name,true);add('Teléfono: '+order.customer_phone);for(const i of order.order_items||[]){add(i.quantity+' × '+i.product_name,true);for(const op of i.selected_options||[])add(op.name);if(i.notes)add(i.notes);add(money(i.line_total));}add('Subtotal: '+money(order.subtotal));add('Delivery: '+money(order.delivery_fee));add('TOTAL: '+money(order.total),true,16);add(order.payment_status==='paid'?'Pagado':'Pago pendiente');add('Documento informativo. No es una boleta tributaria.',false,10);return lines;}
