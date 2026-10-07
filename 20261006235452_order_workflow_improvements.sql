-- New workflows are additive; old clients continue to work until the UI is published.
alter table public.orders alter column payment_method drop not null;
alter table public.orders add column daily_number integer;
alter table public.orders add column order_day date;
alter table public.orders add column comanda_session_id uuid references public.cash_sessions(id);
alter table public.orders add column request_id uuid unique;
alter table public.orders add column gift_sauces jsonb not null default '[]';
alter table public.orders add column chopsticks integer not null default 0 check(chopsticks between 0 and 100);
alter table public.orders add column scheduled_at timestamptz;
alter table public.orders add column manual_delivery boolean not null default false;
alter table public.orders add column manual_delivery_reason text;
alter table public.orders add column whatsapp_text text;
alter table public.orders drop constraint orders_source_channel_check;
alter table public.orders add constraint orders_source_channel_check check(source_channel in ('counter','pedidosya','ubereats','whatsapp'));
alter table public.orders add constraint order_gifts_array check(jsonb_typeof(gift_sauces)='array');
-- Historical tickets retain their existing global number when no session is known.
with numbered as(select o.id,c.id session_id,row_number() over(partition by c.id order by o.created_at,o.order_number)::integer num from public.orders o join public.cash_sessions c on o.created_at>=c.opened_at and (c.closed_at is null or o.created_at<c.closed_at))
update public.orders o set daily_number=n.num,comanda_session_id=n.session_id,order_day=(o.created_at at time zone 'America/Santiago')::date from numbered n where n.id=o.id;
alter table public.orders add constraint session_comanda_unique unique(comanda_session_id,daily_number);
create table public.comanda_counters(session_id uuid primary key references public.cash_sessions(id),last_number integer not null);
alter table public.comanda_counters enable row level security;
revoke all on public.comanda_counters from public,anon,authenticated;
create policy counters_internal_only on public.comanda_counters for all to authenticated using(false) with check(false);
insert into public.comanda_counters select comanda_session_id,max(daily_number) from public.orders where comanda_session_id is not null group by comanda_session_id;
create function public.assign_daily_comanda() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 select id into new.comanda_session_id from public.cash_sessions where closed_at is null for share;
 if new.comanda_session_id is null then raise exception 'Abre la caja antes de registrar un pedido';end if;
 new.order_day:=(now() at time zone 'America/Santiago')::date;
 insert into public.comanda_counters(session_id,last_number) values(new.comanda_session_id,1) on conflict(session_id) do update set last_number=comanda_counters.last_number+1 returning last_number into new.daily_number;
 return new;
end $$;
revoke all on function public.assign_daily_comanda() from public,anon,authenticated;
create trigger assign_daily_comanda before insert on public.orders for each row execute function public.assign_daily_comanda();
create table public.order_drafts(id uuid primary key,user_id uuid not null default auth.uid() references public.profiles(id),data jsonb not null,version integer not null default 1,updated_at timestamptz not null default now(),check(jsonb_typeof(data)='object' and octet_length(data::text)<=150000));
alter table public.order_drafts enable row level security;
revoke all on public.order_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.order_drafts to authenticated;
create policy staff_own_drafts on public.order_drafts for all to authenticated using(user_id=(select auth.uid()) and (select public.staff_can_manage())) with check(user_id=(select auth.uid()) and (select public.staff_can_manage()));
create function public.staff_save_order_draft(p_id uuid,p_data jsonb,p_version integer) returns integer language plpgsql set search_path=public,pg_temp as $$
declare result integer;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_version=0 then
  insert into public.order_drafts(id,user_id,data) values(p_id,auth.uid(),p_data) on conflict do nothing returning version into result;
 else
  update public.order_drafts set data=p_data,version=version+1,updated_at=clock_timestamp() where id=p_id and user_id=auth.uid() and version=p_version returning version into result;
 end if;
 if result is null then raise exception 'El borrador cambió en otra sesión. Recarga antes de guardar';end if;
 return result;
end $$;
revoke all on function public.staff_save_order_draft(uuid,jsonb,integer) from public,anon;
grant execute on function public.staff_save_order_draft(uuid,jsonb,integer) to authenticated;
create function public.rame_phone_key(p_phone text) returns text language sql immutable set search_path='' as $$select case when length(regexp_replace(p_phone,'[^0-9]','','g'))=9 then '56'||regexp_replace(p_phone,'[^0-9]','','g') else regexp_replace(p_phone,'[^0-9]','','g') end$$;
create index customers_phone_search on public.customers(public.rame_phone_key(phone));
create index orders_phone_search on public.orders(public.rame_phone_key(customer_phone));
create function public.staff_find_customer(p_phone text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;key text:=public.rame_phone_key(p_phone);
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if length(key)<8 then return null;end if;
 select jsonb_build_object('name',name,'phone',phone,'address',address,'latitude',latitude,'longitude',longitude,'notes',notes) into result from public.customers where public.rame_phone_key(phone)=key order by created_at desc limit 1;
 if result is null then
 select jsonb_build_object('name',customer_name,'phone',customer_phone,'address',delivery_address,'latitude',delivery_latitude,'longitude',delivery_longitude,'notes',delivery_notes) into result from public.orders where public.rame_phone_key(customer_phone)=key and deleted_at is null order by created_at desc limit 1;
 end if;
 return result;
end $$;
create function public.save_order_customer(p_order uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;c uuid;key text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 select * into o from public.orders where id=p_order and deleted_at is null;
 if o.id is null then raise exception 'Pedido no disponible';end if;
 key:=public.rame_phone_key(o.customer_phone);perform pg_advisory_xact_lock(hashtextextended('rame-customer-'||key,0));
 select id into c from public.customers where public.rame_phone_key(phone)=key order by created_at desc limit 1 for update;
 if c is null then
 insert into public.customers(name,phone,address,latitude,longitude,notes) values(o.customer_name,key,o.delivery_address,o.delivery_latitude,o.delivery_longitude,o.delivery_notes) returning id into c;
 else
 update public.customers set name=o.customer_name,phone=key,address=case when o.fulfillment='delivery' then o.delivery_address else address end,latitude=case when o.fulfillment='delivery' then o.delivery_latitude else latitude end,longitude=case when o.fulfillment='delivery' then o.delivery_longitude else longitude end,notes=case when o.fulfillment='delivery' then o.delivery_notes else notes end where id=c;
 end if;
 update public.orders set customer_id=c where id=p_order;
end $$;
-- Internal writer is reachable only from checked staff RPCs.
revoke all on function public.save_order_customer(uuid) from public,anon,authenticated;
create function public.validate_order_extras(p_data jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare s jsonb;n integer;
begin
 if coalesce(jsonb_typeof(p_data->'gift_sauces'),'')<>'array' or jsonb_array_length(p_data->'gift_sauces')>20 then raise exception 'Salsas inválidas';end if;
 for s in select value from jsonb_array_elements(p_data->'gift_sauces') loop
 if coalesce(jsonb_typeof(s),'')<>'object' or not(s ?& array['name','quantity']) or length(trim(coalesce(s->>'name','')))=0 or length(s->>'name')>80 or jsonb_typeof(s->'quantity')<>'number' or (s->>'quantity')::numeric<>trunc((s->>'quantity')::numeric) or (s->>'quantity')::integer not between 1 and 100 then raise exception 'Tipo o cantidad de salsa inválidos';end if;
 end loop;
 n:=(p_data->>'chopsticks')::integer;
 if n is null or n not between 0 and 100 or (p_data->>'chopsticks')::numeric<>n or length(coalesce(p_data->>'delivery_notes',''))>500 then raise exception 'Palitos o indicaciones inválidos';end if;
 if nullif(p_data->>'scheduled_at','')::timestamptz is not null and (p_data->>'scheduled_at')::timestamptz>now()+interval '2 years' then raise exception 'Fecha de entrega inválida';end if;
end $$;
revoke all on function public.validate_order_extras(jsonb) from public,anon,authenticated;
create function public.staff_submit_order(p_data jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;manual jsonb;previous text;lat numeric;lng numeric;fee integer;pay integer;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_request is null or coalesce(jsonb_typeof(p_data),'')<>'object' or length(coalesce(p_data->>'name',''))>150 or length(coalesce(p_data->>'phone',''))>25 then raise exception 'Pedido inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select id into result from public.orders where request_id=p_request and created_by=auth.uid();if result is not null then return result;end if;
 perform public.validate_order_extras(p_data);
 if coalesce(p_data->>'channel','') not in ('counter','pedidosya','ubereats','whatsapp') then raise exception 'Canal inválido';end if;
 if p_data->>'fulfillment'='delivery' and p_data->'manual_delivery' is not null and p_data->'manual_delivery'<>'null'::jsonb then
 manual:=p_data->'manual_delivery';fee:=(manual->>'customer_fee')::integer;pay:=(manual->>'courier_pay')::integer;
 lat:=(manual->>'lat')::numeric;lng:=(manual->>'lng')::numeric;
 if fee is null or pay is null or fee not between 0 and 1000000 or pay not between 0 and 1000000 or fee<>(manual->>'customer_fee')::numeric or pay<>(manual->>'courier_pay')::numeric or length(trim(coalesce(manual->>'reason','')))<3 or length(manual->>'reason')>250 or (lat is null)<>(lng is null) or (lat is not null and (lat not between -90 and 90 or lng not between -180 and 180)) then raise exception 'Tarifa, motivo o punto manual inválidos';end if;
 previous:=current_setting('rame.manual_delivery',true);perform set_config('rame.manual_delivery',manual::text,true);
 result:=public.staff_create_order(p_data->>'name',p_data->>'phone','delivery','cash',p_data->'items',fee,p_data->>'address',lat,lng);
 perform set_config('rame.manual_delivery',coalesce(previous,''),true);
 elsif p_data->>'fulfillment'='delivery' then
 result:=public.staff_create_delivery_order((p_data->>'quote_id')::uuid,p_data->>'name',p_data->>'phone','cash',p_data->'items',case when p_data->>'channel'='whatsapp' then 'counter' else p_data->>'channel' end);
 elsif p_data->>'fulfillment'='pickup' then
 result:=public.staff_create_order(p_data->>'name',p_data->>'phone','pickup','cash',p_data->'items');
 else raise exception 'Entrega inválida';end if;
 update public.orders set request_id=p_request,payment_method=null,source_channel=p_data->>'channel',gift_sauces=p_data->'gift_sauces',chopsticks=(p_data->>'chopsticks')::integer,scheduled_at=nullif(p_data->>'scheduled_at','')::timestamptz,whatsapp_text=left(p_data->>'whatsapp_text',15000),delivery_notes=p_data->>'delivery_notes' where id=result;
 perform public.save_order_customer(result);
 perform public.staff_transition_order(result,'confirmed');
 return result;
end $$;
create function public.staff_record_order_payment(p_order uuid,p_session uuid,p_method public.payment_method) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 perform 1 from public.orders where id=p_order and deleted_at is null and payment_status='pending' and status<>'cancelled' for update;
 if not found or p_method is null then raise exception 'Pedido no cobrable o medio de pago sin confirmar';end if;
 update public.orders set payment_method=p_method where id=p_order;
 perform public.record_order_payment(p_order,p_session);
end $$;
-- Called only by the authorized, locked edit RPC below.
create function public.replace_order_delivery(p_order uuid,p_delivery jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;q public.delivery_quotes%rowtype;s public.settings%rowtype;m jsonb;fee integer;pay integer;lat numeric;lng numeric;tier text;previous text;address text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 select * into o from public.orders where id=p_order for update;
 if o.id is null or o.fulfillment<>'delivery' or o.deleted_at is not null or o.status not in ('pending','confirmed','preparing','ready') or o.courier_id is not null then raise exception 'El domicilio ya no puede cambiarse';end if;
 address:=trim(p_delivery->>'address');if address is null or length(address)<6 or length(address)>250 then raise exception 'Dirección inválida';end if;
 m:=p_delivery->'manual_delivery';
 if m is not null and m<>'null'::jsonb then
 fee:=(m->>'customer_fee')::integer;pay:=(m->>'courier_pay')::integer;lat:=(m->>'lat')::numeric;lng:=(m->>'lng')::numeric;
 if fee is null or pay is null or fee not between 0 and 1000000 or pay not between 0 and 1000000 or fee<>(m->>'customer_fee')::numeric or pay<>(m->>'courier_pay')::numeric or length(trim(coalesce(m->>'reason','')))<3 or length(m->>'reason')>250 or (lat is null)<>(lng is null) or (lat is not null and (lat not between -90 and 90 or lng not between -180 and 180)) then raise exception 'Tarifa o punto manual inválidos';end if;
 else
 select * into q from public.delivery_quotes where id=(p_delivery->>'quote_id')::uuid and user_id=auth.uid() and used_order_id is null and expires_at>now() for update;
 if q.id is null or q.address is distinct from address then raise exception 'Calcula el nuevo domicilio antes de guardar';end if;
 select * into s from public.settings where id=1 for share;
 if q.config_snapshot is distinct from s.delivery_config or q.origin_lat is distinct from s.delivery_origin_lat or q.origin_lng is distinct from s.delivery_origin_lng then raise exception 'Las tarifas cambiaron. Calcula nuevamente';end if;
 tier:=case when q.distance_m<(s.delivery_config->>'near_km')::numeric*1000 then 'near' when q.distance_m<(s.delivery_config->>'far_km')::numeric*1000 then 'mid' else 'far' end;
 if q.courier_pay<>(s.delivery_config->>(tier||'_pay'))::integer or q.customer_fee<>(s.delivery_config->>(tier||'_fee'))::integer then raise exception 'Tarifa no vigente';end if;
 fee:=q.customer_fee;pay:=q.courier_pay;lat:=q.lat;lng:=q.lng;
 end if;
 if o.payment_status<>'pending' and fee<>o.delivery_fee then raise exception 'Pedido pagado: la tarifa no puede cambiar. Mantén el cobro original';end if;
 previous:=current_setting('rame.replace_delivery',true);perform set_config('rame.replace_delivery',o.id::text,true);
 update public.orders set delivery_address=address,delivery_latitude=lat,delivery_longitude=lng,delivery_fee=fee,courier_delivery_pay=pay,delivery_distance_m=q.distance_m,delivery_quote_id=q.id,delivery_band_label=coalesce(q.band_label,'Tarifa manual'),manual_delivery=q.id is null,manual_delivery_reason=case when q.id is null then m->>'reason' end where id=o.id;
 perform set_config('rame.replace_delivery',coalesce(previous,''),true);
 if q.id is not null then update public.delivery_quotes set used_order_id=o.id where id=q.id;end if;
end $$;
revoke all on function public.replace_order_delivery(uuid,jsonb) from public,anon,authenticated;

create function public.staff_update_order_details(p_order uuid,p_expected timestamptz,p_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;i jsonb;job text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 select * into o from public.orders where id=p_order for update;
 if o.id is null or o.deleted_at is not null or o.status not in ('pending','confirmed','preparing','ready') or o.courier_id is not null then raise exception 'El pedido ya está cerrado, eliminado o asignado';end if;
 if o.updated_at is distinct from p_expected then raise exception 'El pedido cambió en otra sesión. Recarga antes de editar';end if;
 perform 1 from public.print_jobs where order_id=o.id for update;
 if exists(select 1 from public.print_jobs where order_id=o.id and status='claimed') then raise exception 'Espera a que termine la impresión antes de editar';end if;
 if length(trim(coalesce(p_data->>'name','')))<2 or length(p_data->>'name')>150 or length(public.rame_phone_key(p_data->>'phone'))<8 then raise exception 'Nombre y teléfono requeridos';end if;
 perform public.validate_order_extras(p_data);
 if p_data->'delivery_change' is not null and p_data->'delivery_change'<>'null'::jsonb then perform public.replace_order_delivery(o.id,p_data->'delivery_change');end if;
 if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')<>(select count(*) from public.order_items where order_id=o.id) or exists(select 1 from jsonb_array_elements(p_data->'items') x group by x->>'id' having count(*)>1) then raise exception 'Detalle de productos inválido';end if;
 for i in select value from jsonb_array_elements(p_data->'items') loop
 update public.order_items set notes=left(coalesce(i->>'notes',''),500) where id=(i->>'id')::uuid and order_id=o.id;
 if not found then raise exception 'Producto fuera del pedido';end if;
 end loop;
 update public.orders set customer_name=trim(p_data->>'name'),customer_phone=p_data->>'phone',gift_sauces=p_data->'gift_sauces',chopsticks=(p_data->>'chopsticks')::integer,scheduled_at=nullif(p_data->>'scheduled_at','')::timestamptz,delivery_notes=p_data->>'delivery_notes' where id=o.id;
 perform public.save_order_customer(o.id);
 if o.status<>'pending' and not exists(select 1 from public.print_jobs where order_id=o.id and status='pending' and job_type not like 'prebill-%') then
 job:='correction-'||gen_random_uuid()::text;
 insert into public.print_jobs(order_id,job_type) values(o.id,job);
 end if;
end $$;
-- Do not permit legacy payment RPCs to charge a missing method.
create or replace function public.record_order_payment(p_order_id uuid,p_session_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'Not authorized';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.deleted_at is not null or o.status='cancelled' or o.payment_status<>'pending' then raise exception 'Order not payable';end if;
 if o.payment_method is null then raise exception 'Confirma el medio de pago en Pedidos';end if;
 perform 1 from public.cash_sessions where id=p_session_id and closed_at is null for update;
 if not found then raise exception 'No open cash session';end if;
 update public.orders set payment_status='paid' where id=p_order_id;
 insert into public.cash_movements(session_id,order_id,kind,method,amount,description,created_by) values(p_session_id,o.id,'income',o.payment_method,o.total,'Pago pedido '||coalesce(o.daily_number,o.order_number),auth.uid());
end $$;
revoke all on function public.staff_find_customer(text),public.staff_submit_order(jsonb,uuid),public.staff_record_order_payment(uuid,uuid,public.payment_method),public.staff_update_order_details(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.staff_find_customer(text),public.staff_submit_order(jsonb,uuid),public.staff_record_order_payment(uuid,uuid,public.payment_method),public.staff_update_order_details(uuid,timestamptz,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.validate_delivery_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.delivery_quotes%rowtype;s public.settings%rowtype;quote_hint text;tier text;
begin
 if new.fulfillment='delivery' and nullif(current_setting('rame.manual_delivery',true),'') is not null then
  if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
  new.manual_delivery:=true;new.manual_delivery_reason:=(current_setting('rame.manual_delivery',true)::jsonb)->>'reason';
  new.courier_delivery_pay:=((current_setting('rame.manual_delivery',true)::jsonb)->>'courier_pay')::integer;
  new.delivery_band_label:='Tarifa manual';new.delivery_distance_m:=null;new.delivery_quote_id:=null;
  return new;
 end if;
 if new.fulfillment='pickup' then
  if new.delivery_fee<>0 then raise exception 'Retiro sin tarifa de reparto';end if;
  new.delivery_quote_id:=null;new.delivery_distance_m:=null;new.courier_delivery_pay:=null;new.delivery_band_label:=null;
  return new;
 end if;
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 select * into s from public.settings where id=1 for share;
 quote_hint:=nullif(current_setting('rame.delivery_quote',true),'');
 select * into q from public.delivery_quotes where user_id=auth.uid() and used_order_id is null and expires_at>now()
  and address=new.delivery_address and lat=new.delivery_latitude and lng=new.delivery_longitude and customer_fee=new.delivery_fee
  and (quote_hint is null or id=quote_hint::uuid) order by created_at desc limit 1 for update;
 if q.id is null then raise exception 'Calcula y confirma la ubicación del delivery antes de registrar';end if;
 if q.config_snapshot is distinct from s.delivery_config or q.origin_lat is distinct from s.delivery_origin_lat or q.origin_lng is distinct from s.delivery_origin_lng then
  raise exception 'Las tarifas o el punto de salida cambiaron. Calcula el reparto nuevamente';end if;
 tier:=case when q.distance_m<(s.delivery_config->>'near_km')::numeric*1000 then 'near' when q.distance_m<(s.delivery_config->>'far_km')::numeric*1000 then 'mid' else 'far' end;
 if q.courier_pay<>(s.delivery_config->>(tier||'_pay'))::integer or q.customer_fee<>(s.delivery_config->>(tier||'_fee'))::integer then raise exception 'El cálculo del tramo no coincide con las tarifas vigentes';end if;
 new.delivery_quote_id:=q.id;new.delivery_distance_m:=q.distance_m;new.courier_delivery_pay:=q.courier_pay;new.delivery_band_label:=q.band_label;
 update public.delivery_quotes set used_order_id=new.id where id=q.id;
 return new;
end $function$;


create or replace function public.preserve_delivery_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.delivery_quote_id,new.delivery_distance_m,new.courier_delivery_pay,new.delivery_band_label,new.delivery_fee,new.delivery_address,new.delivery_latitude,new.delivery_longitude)
 is distinct from row(old.delivery_quote_id,old.delivery_distance_m,old.courier_delivery_pay,old.delivery_band_label,old.delivery_fee,old.delivery_address,old.delivery_latitude,old.delivery_longitude)
 and (old.delivery_quote_id is not null or old.manual_delivery) and coalesce(current_setting('rame.replace_delivery',true),'')<>old.id::text then raise exception 'El cálculo de reparto solo se cambia desde la edición autorizada';end if;
 if new.status='delivered' and old.status<>'delivered' then new.delivered_at:=now();else new.delivered_at:=old.delivered_at;end if;
 if new.comanda_session_id is distinct from old.comanda_session_id or new.daily_number is distinct from old.daily_number then raise exception 'El número de comanda y su jornada no pueden cambiar';end if;
 return new;
end $$;
revoke all on function public.preserve_delivery_snapshot(),public.validate_delivery_fee() from public,anon,authenticated;

create table public.payroll_payments(id uuid primary key default gen_random_uuid(),worker_id uuid not null references public.profiles(id),amount integer not null check(amount>0),method public.payment_method not null,paid_at timestamptz not null default now(),notes text not null default '',created_by uuid not null references public.profiles(id),request_id uuid not null unique);
alter table public.payroll_payments enable row level security;
revoke all on public.payroll_payments from public,anon,authenticated;
grant select on public.payroll_payments to authenticated;
create policy own_payroll_payments on public.payroll_payments for select to authenticated using((select public.is_owner()) or (worker_id=(select auth.uid()) and (select public.current_role()) is not null));
create index payroll_worker_date on public.payroll_payments(worker_id,paid_at);
create function public.owner_record_payroll_payment(p_worker uuid,p_amount integer,p_method public.payment_method,p_notes text,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración';end if;
 if p_amount is null or p_amount not between 1 and 1000000000 or p_method is null or length(coalesce(p_notes,''))>500 or p_request is null then raise exception 'Pago inválido';end if;
 if not exists(select 1 from public.profiles where id=p_worker and role in ('worker','cashier','courier')) then raise exception 'Trabajador inválido';end if;
 insert into public.payroll_payments(worker_id,amount,method,notes,created_by,request_id) values(p_worker,p_amount,p_method,coalesce(p_notes,''),auth.uid(),p_request) on conflict(request_id) do nothing returning id into result;
 if result is null then select id into result from public.payroll_payments where request_id=p_request and worker_id=p_worker and amount=p_amount and method=p_method;end if;
 if result is null then raise exception 'La referencia de pago ya se usó para otro registro';end if;
 return result;
end $$;
create function public.staff_payroll_report(p_from date,p_to date) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;since timestamptz;until timestamptz;
begin
 if auth.uid() is null or public.current_role() is null then raise exception 'No autorizado';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>730 then raise exception 'Selecciona un período de hasta dos años';end if;
 since:=p_from::timestamp at time zone 'America/Santiago';until:=(p_to+1)::timestamp at time zone 'America/Santiago';
 select jsonb_build_object('as_of',now(),'workers',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role,
 'earned',coalesce((select sum(round(greatest(0,extract(epoch from(t.clock_out-t.clock_in))/3600-t.unpaid_break_minutes/60.0)*t.hourly_rate)) from public.time_entries t where t.worker_id=p.id and t.clock_out is not null),0),
 'delivery_earned',coalesce((select sum(o.courier_delivery_pay) from public.orders o where o.courier_id=p.id and o.status='delivered'),0),
 'paid',coalesce((select sum(x.amount) from public.payroll_payments x where x.worker_id=p.id),0),
 'shifts',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('minutes',greatest(0,extract(epoch from(coalesce(t.clock_out,least(now(),until))-t.clock_in))/60-t.unpaid_break_minutes),'base',round(greatest(0,extract(epoch from(coalesce(t.clock_out,least(now(),until))-t.clock_in))/3600-t.unpaid_break_minutes/60.0)*t.hourly_rate)) order by t.clock_in desc) from public.time_entries t where t.worker_id=p.id and ((t.clock_out>=since and t.clock_out<until) or (t.clock_out is null and t.clock_in<until and now()>=since))),'[]'::jsonb),
 'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',coalesce(o.daily_number,o.order_number),'at',o.delivered_at,'pay',o.courier_delivery_pay) order by o.delivered_at desc) from public.orders o where o.courier_id=p.id and o.status='delivered' and o.delivered_at>=since and o.delivered_at<until),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_at desc) from public.payroll_payments x where x.worker_id=p.id and x.paid_at>=since and x.paid_at<until),'[]'::jsonb)
 ) order by p.full_name),'[]'::jsonb)) into result from public.profiles p where (public.is_owner() and p.role in ('worker','cashier','courier') or p.id=auth.uid());
 return result;
end $$;
revoke all on function public.owner_record_payroll_payment(uuid,integer,public.payment_method,text,uuid),public.staff_payroll_report(date,date) from public,anon;
grant execute on function public.owner_record_payroll_payment(uuid,integer,public.payment_method,text,uuid),public.staff_payroll_report(date,date) to authenticated;

create or replace function public.staff_set_order_channel(p_order uuid,p_channel text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_channel is null or p_channel not in ('counter','pedidosya','ubereats','whatsapp') then raise exception 'Canal inválido';end if;
 update public.orders set source_channel=p_channel where id=p_order and status='pending' and deleted_at is null;
 if not found then raise exception 'El canal solo se cambia antes de confirmar';end if;
end $$;
revoke all on function public.staff_set_order_channel(uuid,text) from public,anon;
grant execute on function public.staff_set_order_channel(uuid,text) to authenticated;

create table public.hardware_jobs(id uuid primary key default gen_random_uuid(),command text not null check(command='open_drawer'),status text not null default 'pending' check(status in ('pending','claimed','sent','failed')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 seconds',claimed_at timestamptz,sent_at timestamptz,attempts integer not null default 0,error text,request_id uuid not null unique);
alter table public.hardware_jobs enable row level security;
revoke all on public.hardware_jobs from public,anon,authenticated;
grant select on public.hardware_jobs to authenticated;
grant all on public.hardware_jobs to service_role;
create policy staff_hardware_read on public.hardware_jobs for select to authenticated using((select public.staff_can_manage()));
create index hardware_pending on public.hardware_jobs(created_at) where status='pending';
create function public.staff_open_drawer(p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_request is null then raise exception 'Referencia requerida';end if;
 perform pg_advisory_xact_lock(hashtextextended('rame-drawer-'||auth.uid()::text,0));
 select id into result from public.hardware_jobs where request_id=p_request and created_by=auth.uid();if result is not null then return result;end if;
 if exists(select 1 from public.hardware_jobs where created_by=auth.uid() and created_at>now()-interval '3 seconds') then raise exception 'Espera unos segundos antes de abrir nuevamente';end if;
 insert into public.hardware_jobs(command,created_by,request_id) values('open_drawer',auth.uid(),p_request) returning id into result;
 return result;
end $$;
create function public.staff_queue_order_print(p_order uuid,p_kind text,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;result uuid;kind text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_request is null or p_kind is null or p_kind not in ('kitchen','prebill') then raise exception 'Solicitud inválida';end if;
 select * into o from public.orders where id=p_order for update;
 if o.id is null or o.deleted_at is not null or o.status in ('pending','cancelled') then raise exception 'Pedido no disponible para impresión';end if;
 kind:=case when p_kind='prebill' then 'prebill-' else 'reprint-' end||p_request::text;
 insert into public.print_jobs(order_id,job_type) values(o.id,kind) on conflict(order_id,job_type) do nothing returning id into result;
 if result is null then select id into result from public.print_jobs where order_id=o.id and job_type=kind;end if;
 return result;
end $$;
revoke all on function public.staff_open_drawer(uuid),public.staff_queue_order_print(uuid,text,uuid) from public,anon;
grant execute on function public.staff_open_drawer(uuid),public.staff_queue_order_print(uuid,text,uuid) to authenticated;

create index order_drafts_user on public.order_drafts(user_id,updated_at);
create index payroll_created_by on public.payroll_payments(created_by);
create index hardware_created_by on public.hardware_jobs(created_by,created_at);
