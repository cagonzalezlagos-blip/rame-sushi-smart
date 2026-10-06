-- Route-based delivery quotes and immutable compensation snapshots.
create or replace function public.valid_delivery_config(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if c is null or jsonb_typeof(c)<>'object' or not(c ?& array['near_km','far_km','near_pay','mid_pay','far_pay','near_fee','mid_fee','far_fee']) then return false;end if;
 if exists(select 1 from unnest(array['near_km','far_km','near_pay','mid_pay','far_pay','near_fee','mid_fee','far_fee']) k where jsonb_typeof(c->k)<>'number') then return false;end if;
 if (c->>'near_km')::numeric<=0 or (c->>'far_km')::numeric<=(c->>'near_km')::numeric or (c->>'far_km')::numeric>100 then return false;end if;
 if exists(select 1 from unnest(array['near_pay','mid_pay','far_pay','near_fee','mid_fee','far_fee']) k where (c->>k)::numeric<0 or (c->>k)::numeric>1000000 or (c->>k)::numeric<>trunc((c->>k)::numeric)) then return false;end if;
 return true;
end $$;
alter table public.settings add column delivery_config jsonb not null default '{"near_km":3,"far_km":5,"near_pay":1000,"mid_pay":1500,"far_pay":2000,"near_fee":0,"mid_fee":0,"far_fee":0}'::jsonb;
alter table public.settings add column delivery_origin_lat numeric;
alter table public.settings add column delivery_origin_lng numeric;
update public.settings set delivery_origin_lat=latitude,delivery_origin_lng=longitude;
alter table public.settings add constraint delivery_config_valid check(public.valid_delivery_config(delivery_config));
alter table public.settings add constraint delivery_origin_valid check((delivery_origin_lat is null and delivery_origin_lng is null) or (delivery_origin_lat is not null and delivery_origin_lng is not null and delivery_origin_lat between -90 and 90 and delivery_origin_lng between -180 and 180));
create table public.delivery_quotes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 address text not null,lat numeric not null,lng numeric not null,origin_lat numeric not null,origin_lng numeric not null,
 distance_m integer not null check(distance_m between 0 and 100000),courier_pay integer not null check(courier_pay>=0),customer_fee integer not null check(customer_fee>=0),
 band_label text not null,config_snapshot jsonb not null,provider text not null,
 expires_at timestamptz not null default(now()+interval '20 minutes'),created_at timestamptz not null default now(),used_order_id uuid
);
create index delivery_quotes_owner_expiry on public.delivery_quotes(user_id,expires_at);
create table public.delivery_lookup_cache(cache_key text primary key,data jsonb not null,expires_at timestamptz not null);
create table public.delivery_provider_clock(provider text primary key,last_at timestamptz not null);
alter table public.delivery_quotes enable row level security;
alter table public.delivery_lookup_cache enable row level security;
alter table public.delivery_provider_clock enable row level security;
revoke all on public.delivery_quotes,public.delivery_lookup_cache,public.delivery_provider_clock from anon,authenticated;
grant all on public.delivery_quotes,public.delivery_lookup_cache,public.delivery_provider_clock to service_role;

create or replace function public.delivery_claim_provider_slot(p_provider text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare last_used timestamptz;
begin
 if p_provider not in ('photon','osrm') then raise exception 'Proveedor inválido';end if;
 perform pg_advisory_xact_lock(20261006,case p_provider when 'photon' then 2 else 3 end);
 select last_at into last_used from public.delivery_provider_clock where provider=p_provider;
 if last_used is not null and last_used>clock_timestamp()-interval '1100 milliseconds' then return false;end if;
 insert into public.delivery_provider_clock(provider,last_at) values(p_provider,clock_timestamp()) on conflict(provider) do update set last_at=excluded.last_at;
 return true;
end $$;
revoke all on function public.delivery_claim_provider_slot(text) from public,anon,authenticated;
grant execute on function public.delivery_claim_provider_slot(text) to service_role;

alter table public.orders add column delivery_quote_id uuid unique references public.delivery_quotes(id);
alter table public.orders add column delivery_distance_m integer;
alter table public.orders add column courier_delivery_pay integer;
alter table public.orders add column delivery_band_label text;
alter table public.orders add column delivered_at timestamptz;
create index orders_delivery_pay_report on public.orders(courier_id,delivered_at) where courier_delivery_pay is not null;

create or replace function public.validate_delivery_fee() returns trigger
language plpgsql security definer set search_path='' as $$
declare q public.delivery_quotes%rowtype;s public.settings%rowtype;quote_hint text;tier text;
begin
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
end $$;
revoke all on function public.validate_delivery_fee() from public,anon,authenticated;

create or replace function public.preserve_delivery_snapshot() returns trigger
language plpgsql set search_path='' as $$
begin
 if row(new.delivery_quote_id,new.delivery_distance_m,new.courier_delivery_pay,new.delivery_band_label,new.delivery_fee,new.delivery_address,new.delivery_latitude,new.delivery_longitude)
 is distinct from row(old.delivery_quote_id,old.delivery_distance_m,old.courier_delivery_pay,old.delivery_band_label,old.delivery_fee,old.delivery_address,old.delivery_latitude,old.delivery_longitude)
 and old.delivery_quote_id is not null then raise exception 'El cálculo de reparto del pedido es inmutable';end if;
 if new.status='delivered' and old.status<>'delivered' then new.delivered_at:=now();else new.delivered_at:=old.delivered_at;end if;
 return new;
end $$;
revoke all on function public.preserve_delivery_snapshot() from public,anon,authenticated;
create trigger preserve_delivery_snapshot before update on public.orders for each row execute function public.preserve_delivery_snapshot();

create or replace function public.staff_create_delivery_order(p_quote uuid,p_customer_name text,p_customer_phone text,p_payment public.payment_method,p_items jsonb,p_channel text default 'counter') returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.delivery_quotes%rowtype;result_id uuid;previous_hint text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_channel is null or p_channel not in ('counter','pedidosya','ubereats') then raise exception 'Canal inválido';end if;
 select * into q from public.delivery_quotes where id=p_quote and user_id=auth.uid() and used_order_id is null and expires_at>now() for update;
 if q.id is null then raise exception 'El cálculo venció o ya fue usado. Calcula el reparto nuevamente';end if;
 previous_hint:=current_setting('rame.delivery_quote',true);
 perform set_config('rame.delivery_quote',q.id::text,true);
 result_id:=public.staff_create_order(p_customer_name,p_customer_phone,'delivery',p_payment,p_items,q.customer_fee,q.address,q.lat,q.lng);
 perform set_config('rame.delivery_quote',coalesce(previous_hint,''),true);
 update public.orders set source_channel=p_channel where id=result_id;
 return result_id;
end $$;
revoke all on function public.staff_create_delivery_order(uuid,text,text,public.payment_method,jsonb,text) from public,anon;
grant execute on function public.staff_create_delivery_order(uuid,text,text,public.payment_method,jsonb,text) to authenticated;

create or replace function public.owner_set_delivery_config(p_config jsonb,p_lat numeric,p_lng numeric,p_expected jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare previous jsonb;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración';end if;
 if not public.valid_delivery_config(p_config) or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Tarifas o coordenadas inválidas';end if;
 select jsonb_build_object('config',delivery_config,'lat',delivery_origin_lat,'lng',delivery_origin_lng) into previous from public.settings where id=1 for update;
 if p_expected is distinct from previous then raise exception 'Otra administración modificó las tarifas. Recarga antes de guardar';end if;
 update public.settings set delivery_config=p_config,delivery_origin_lat=p_lat,delivery_origin_lng=p_lng where id=1;
end $$;
revoke all on function public.owner_set_delivery_config(jsonb,numeric,numeric,jsonb) from public,anon;
grant execute on function public.owner_set_delivery_config(jsonb,numeric,numeric,jsonb) to authenticated;

create or replace function public.courier_delivery_report(p_day date) returns table(order_id uuid,order_number bigint,courier_id uuid,courier_name text,distance_m integer,courier_pay integer,band_label text,delivered_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_role() is null then raise exception 'No autorizado';end if;
 return query select o.id,o.order_number::bigint,o.courier_id,p.full_name,o.delivery_distance_m,o.courier_delivery_pay,o.delivery_band_label,o.delivered_at
 from public.orders o join public.profiles p on p.id=o.courier_id
 where o.fulfillment='delivery' and o.status='delivered' and o.courier_delivery_pay is not null
 and o.delivered_at>=(p_day::timestamp at time zone 'America/Santiago') and o.delivered_at<((p_day+1)::timestamp at time zone 'America/Santiago')
 and (public.is_owner() or public.current_role()='cashier' or o.courier_id=auth.uid()) order by o.delivered_at;
end $$;
revoke all on function public.courier_delivery_report(date) from public,anon;
grant execute on function public.courier_delivery_report(date) to authenticated;

create or replace function public.shift_delivery_payments(p_shifts uuid[]) returns table(shift_id uuid,deliveries bigint,amount bigint)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_role() is null then raise exception 'No autorizado';end if;
 if coalesce(array_length(p_shifts,1),0)>200 then raise exception 'Demasiadas jornadas';end if;
 return query select t.id,count(o.id),coalesce(sum(o.courier_delivery_pay),0)::bigint
 from public.time_entries t left join public.orders o on o.courier_id=t.worker_id and o.status='delivered' and o.delivered_at>=t.clock_in and (t.clock_out is null or o.delivered_at<t.clock_out) and o.courier_delivery_pay is not null
 where t.id=any(p_shifts) and (public.is_owner() or public.current_role()='cashier' or t.worker_id=auth.uid()) group by t.id;
end $$;
revoke all on function public.shift_delivery_payments(uuid[]) from public,anon;
grant execute on function public.shift_delivery_payments(uuid[]) to authenticated;
-- Public branding stays public; internal delivery tariffs are staff-only.
drop policy if exists settings_read on public.settings;
create policy settings_staff_read on public.settings for select to authenticated using ((select public.staff_can_manage()));
create or replace function public.public_business_settings() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('business_name',s.business_name,'address',s.address,'phone',s.phone,'currency',s.currency,'brand_config',s.brand_config) from public.settings s where s.id=1
$$;
revoke all on function public.public_business_settings() from public;
grant execute on function public.public_business_settings() to anon,authenticated;
