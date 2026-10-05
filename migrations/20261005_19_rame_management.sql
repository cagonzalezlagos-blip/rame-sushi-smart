-- Prepared for staging; requires the 20260928 and business_config migrations first.
-- Do not run against production until the connected frontend and printer are ready.
alter table public.orders add column if not exists source_channel text not null default 'counter';
alter table public.orders drop constraint if exists orders_source_channel_check;
alter table public.orders add constraint orders_source_channel_check check (source_channel in ('counter','pedidosya','ubereats'));

create table if not exists public.supplier_payments (
 id uuid primary key default gen_random_uuid(), supplier_name text not null check (length(trim(supplier_name))>=2),
 description text not null check (length(trim(description))>=3), amount integer not null check (amount>0),
 method text not null check (method in ('cash','card','transfer')),
 status text not null default 'pending' check (status in ('pending','paid')),
 due_at date, paid_at timestamptz, created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id)
);
alter table public.cash_movements add column if not exists supplier_payment_id uuid references public.supplier_payments(id);
create unique index if not exists cash_movement_one_supplier on public.cash_movements(supplier_payment_id) where supplier_payment_id is not null;
alter table public.supplier_payments enable row level security;
revoke all on public.supplier_payments from anon,authenticated;
grant select on public.supplier_payments to authenticated;
drop policy if exists supplier_owner_read on public.supplier_payments;
create policy supplier_owner_read on public.supplier_payments for select to authenticated using ((select public.is_owner()));

create table if not exists public.courier_journeys (
 shift_id uuid primary key references public.time_entries(id),
 courier_id uuid not null references public.profiles(id),
 distance_m integer not null default 0 check (distance_m>=0),
 last_lat double precision, last_lng double precision, accuracy_m numeric,
 last_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists courier_journeys_courier on public.courier_journeys(courier_id,updated_at desc);
alter table public.courier_journeys enable row level security;
revoke all on public.courier_journeys from anon,authenticated;
grant select on public.courier_journeys to authenticated;
drop policy if exists courier_journeys_read on public.courier_journeys;
create policy courier_journeys_read on public.courier_journeys for select to authenticated
 using (courier_id=(select auth.uid()) or (select public.is_owner()));

-- The cashier can view personnel and attendance, but may not change pay or roles.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select public.is_owner()) or
        (select public."current_role"())='cashier' or
        ((select public.staff_can_manage()) and role='courier' and active));
drop policy if exists time_entries_read on public.time_entries;
drop policy if exists entries_read on public.time_entries;
create policy time_entries_read on public.time_entries for select to authenticated
 using (worker_id=(select auth.uid()) or (select public.is_owner()) or (select public."current_role"())='cashier');

create or replace function public.staff_set_order_channel(p_order uuid,p_channel text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado'; end if;
 if p_channel not in ('counter','pedidosya','ubereats') then raise exception 'Canal inválido'; end if;
 update public.orders set source_channel=p_channel where id=p_order and status='pending';
 if not found then raise exception 'Solo se puede cambiar el canal de un pedido pendiente'; end if;
end $$;

create or replace function public.owner_record_supplier_payment(p_supplier text,p_description text,p_amount integer,p_method text,p_due date,p_paid boolean,p_session uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_method public.payment_method;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración'; end if;
 if length(trim(coalesce(p_supplier,'')))<2 or length(trim(coalesce(p_description,'')))<3 or p_amount is null or p_amount<=0 or p_method not in ('cash','card','transfer') then raise exception 'Datos inválidos'; end if;
 if coalesce(p_paid,false) and p_session is not null and not exists(select 1 from public.cash_sessions where id=p_session and closed_at is null) then raise exception 'Caja cerrada'; end if;
 insert into public.supplier_payments(supplier_name,description,amount,method,status,due_at,paid_at,created_by)
 values(trim(p_supplier),trim(p_description),p_amount,p_method,case when p_paid then 'paid' else 'pending' end,p_due,case when p_paid then now() end,auth.uid()) returning id into v_id;
 if coalesce(p_paid,false) and p_session is not null then
  v_method:=p_method::public.payment_method;
  insert into public.cash_movements(session_id,kind,method,amount,description,created_by,supplier_payment_id)
  values(p_session,'expense',v_method,-p_amount,'Proveedor: '||trim(p_supplier)||' · '||trim(p_description),auth.uid(),v_id);
 end if;
 return v_id;
end $$;

create or replace function public.owner_pay_supplier(p_id uuid,p_session uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_payment public.supplier_payments%rowtype;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración'; end if;
 select * into v_payment from public.supplier_payments where id=p_id for update;
 if not found or v_payment.status<>'pending' then raise exception 'Pago ya registrado o inexistente'; end if;
 if p_session is not null and not exists(select 1 from public.cash_sessions where id=p_session and closed_at is null) then raise exception 'Caja cerrada'; end if;
 update public.supplier_payments set status='paid',paid_at=now() where id=p_id;
 if p_session is not null then
  insert into public.cash_movements(session_id,kind,method,amount,description,created_by,supplier_payment_id)
  values(p_session,'expense',v_payment.method::public.payment_method,-v_payment.amount,'Proveedor: '||v_payment.supplier_name||' · '||v_payment.description,auth.uid(),p_id);
 end if;
end $$;

create or replace function public.courier_report_position(p_lat double precision,p_lng double precision,p_accuracy numeric) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_shift uuid;v_prev public.courier_journeys%rowtype;v_distance double precision;v_elapsed double precision;v_add integer:=0;
begin
 if auth.uid() is null or public."current_role"()<>'courier' then raise exception 'Solo reparto'; end if;
 if not exists(select 1 from public.orders where courier_id=auth.uid() and status='out_for_delivery') then raise exception 'No hay reparto activo'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy is null or p_accuracy<0 or p_accuracy>100 then raise exception 'Ubicación imprecisa'; end if;
 select id into v_shift from public.time_entries where worker_id=auth.uid() and clock_out is null order by clock_in desc limit 1;
 if v_shift is null then raise exception 'Marca el inicio de jornada antes del reparto'; end if;
 insert into public.courier_journeys(shift_id,courier_id) values(v_shift,auth.uid()) on conflict (shift_id) do nothing;
 select * into v_prev from public.courier_journeys where shift_id=v_shift for update;
 if v_prev.last_at is not null then
  v_elapsed:=extract(epoch from now()-v_prev.last_at);
  v_distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((p_lat-v_prev.last_lat)/2)),2)+cos(radians(v_prev.last_lat))*cos(radians(p_lat))*power(sin(radians((p_lng-v_prev.last_lng)/2)),2))));
  if v_elapsed between 8 and 600 and v_distance>=20 and v_distance<=v_elapsed*35 then v_add:=round(v_distance)::integer; end if;
 end if;
 update public.courier_journeys set last_lat=p_lat,last_lng=p_lng,accuracy_m=p_accuracy,last_at=now(),updated_at=now(),distance_m=distance_m+v_add where shift_id=v_shift;
 return v_prev.distance_m+v_add;
end $$;

-- Keep the total distance, but erase precise coordinates when the shift ends.
create or replace function public.clear_courier_shift_location() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if old.clock_out is null and new.clock_out is not null then
  update public.courier_journeys set last_lat=null,last_lng=null,accuracy_m=null,last_at=null where shift_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists clear_courier_shift_location on public.time_entries;
create trigger clear_courier_shift_location after update of clock_out on public.time_entries
for each row execute function public.clear_courier_shift_location();
revoke execute on function public.clear_courier_shift_location() from public,anon,authenticated;

revoke execute on function public.staff_set_order_channel(uuid,text),public.owner_record_supplier_payment(text,text,integer,text,date,boolean,uuid),public.owner_pay_supplier(uuid,uuid),public.courier_report_position(double precision,double precision,numeric) from public,anon;
grant execute on function public.staff_set_order_channel(uuid,text),public.owner_record_supplier_payment(text,text,integer,text,date,boolean,uuid),public.owner_pay_supplier(uuid,uuid),public.courier_report_position(double precision,double precision,numeric) to authenticated;
