-- Review and apply to the Ramé Sushi project as one deployment, before the frontend.
-- Existing data and functions are retained. This migration is idempotent for a staging retry.
alter table public.profiles add column if not exists hourly_rate integer not null default 0 check (hourly_rate >= 0);
alter table public.settings add column if not exists attendance_radius_m integer not null default 75 check (attendance_radius_m between 20 and 200);

create table if not exists public.attendance_qr (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 local_day date not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null, created_by uuid not null references public.profiles(id)
);
create table if not exists public.attendance_attempts (
 id bigint generated always as identity primary key,
 worker_id uuid not null references public.profiles(id),
 qr_id uuid references public.attendance_qr(id),
 action text not null check (action in ('in','out','override_in','override_out')),
 success boolean not null,
 reason text, accuracy_m numeric,
 created_at timestamptz not null default now()
);
create unique index if not exists attendance_one_open_per_worker on public.time_entries(worker_id) where clock_out is null;
create index if not exists attendance_attempts_worker_at on public.attendance_attempts(worker_id,created_at desc);
alter table public.attendance_qr enable row level security;
alter table public.attendance_attempts enable row level security;
revoke all on public.attendance_qr,public.attendance_attempts from anon,authenticated;
grant select on public.attendance_attempts to authenticated;
drop policy if exists attendance_attempts_read on public.attendance_attempts;
create policy attendance_attempts_read on public.attendance_attempts for select to authenticated using (worker_id=(select auth.uid()) or (select public.is_owner()));

-- A cashier must see active couriers for assignment; profile edits remain owner-only.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select public.is_owner()) or
        ((select public.staff_can_manage()) and role='courier' and active));
drop policy if exists entries_manage on public.time_entries;

-- Restrict direct Data API mutation of sensitive records. RPCs below implement the allowed transitions.
drop policy if exists orders_staff on public.orders;
create policy orders_staff_read on public.orders for select to authenticated using ((select public.staff_can_manage()));
drop policy if exists sessions_staff on public.cash_sessions;
create policy sessions_staff_read on public.cash_sessions for select to authenticated using ((select public.staff_can_manage()));
drop policy if exists movements_staff on public.cash_movements;
create policy movements_staff_read on public.cash_movements for select to authenticated using ((select public.staff_can_manage()));

create or replace function public.attendance_issue_qr() returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token text; v_exp timestamptz; v_day date; begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo la dueña puede generar QR'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 v_exp:=now()+interval '5 minutes';v_day:=(now() at time zone 'America/Santiago')::date;
 insert into public.attendance_qr(token_hash,local_day,expires_at,created_by)
 values (encode(extensions.digest(v_token,'sha256'),'hex'),v_day,v_exp,auth.uid());
 return jsonb_build_object('token',v_token,'expires_at',v_exp);
end $$;

create or replace function public.attendance_mark(p_token text,p_lat numeric,p_lng numeric,p_accuracy numeric) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_qr public.attendance_qr%rowtype;v_settings public.settings%rowtype;
 v_open public.time_entries%rowtype;v_distance numeric;v_action text;v_reason text;
begin
 if auth.uid() is null or public."current_role"() is null then raise exception 'Acceso no autorizado';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'QR inválido';end if;
 select * into v_qr from public.attendance_qr where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into v_settings from public.settings where id=1;
 select * into v_open from public.time_entries where worker_id=auth.uid() and clock_out is null for update;
 v_action:=case when found then 'out' else 'in' end;
 if v_qr.id is null or v_qr.expires_at<=now() or v_qr.local_day<>(now() at time zone 'America/Santiago')::date then v_reason:='QR vencido o incorrecto';
 elsif v_settings.latitude is null or v_settings.longitude is null then v_reason:='Ubicación del local no configurada';
 elsif p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy is null or p_accuracy<0 or p_accuracy>50 then v_reason:='Ubicación imprecisa';
 else
   v_distance:=6371000*2*asin(sqrt(least(1,power(sin(radians((p_lat-v_settings.latitude)::double precision)/2),2)+cos(radians(v_settings.latitude::double precision))*cos(radians(p_lat::double precision))*power(sin(radians((p_lng-v_settings.longitude)::double precision)/2),2))));
   if v_distance>v_settings.attendance_radius_m then v_reason:='Fuera del local';end if;
 end if;
 if v_reason is null and exists(select 1 from public.attendance_attempts where worker_id=auth.uid() and qr_id=v_qr.id and action=v_action and success) then v_reason:='QR ya usado para esta marca';end if;
 insert into public.attendance_attempts(worker_id,qr_id,action,success,reason,accuracy_m) values(auth.uid(),v_qr.id,v_action,v_reason is null,v_reason,p_accuracy);
 if v_reason is not null then return jsonb_build_object('success',false,'reason',v_reason);end if;
 if v_action='in' then
   insert into public.time_entries(worker_id,hourly_rate) select id,hourly_rate from public.profiles where id=auth.uid();
 else update public.time_entries set clock_out=now() where id=v_open.id;end if;
 return jsonb_build_object('success',true,'action',v_action);
end $$;

-- Owner corrections retain an explanation and audit trail.
create or replace function public.attendance_override(p_worker uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_open uuid;begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo la dueña puede corregir asistencia';end if;
 if p_action not in ('in','out') or length(trim(coalesce(p_reason,'')))<8 then raise exception 'Indica acción y motivo';end if;
 if not exists(select 1 from public.profiles where id=p_worker and active) then raise exception 'Trabajador no habilitado';end if;
 select id into v_open from public.time_entries where worker_id=p_worker and clock_out is null for update;
 if p_action='in' and v_open is not null or p_action='out' and v_open is null then raise exception 'Estado de jornada incompatible';end if;
 if p_action='in' then insert into public.time_entries(worker_id,hourly_rate,notes,approved_by) select id,hourly_rate,p_reason,auth.uid() from public.profiles where id=p_worker;
 else update public.time_entries set clock_out=now(),notes=concat_ws(' | ',notes,p_reason),approved_by=auth.uid() where id=v_open;end if;
 insert into public.attendance_attempts(worker_id,action,success,reason) values(p_worker,'override_'||p_action,true,p_reason);
end $$;

create or replace function public.staff_transition_order(p_order_id uuid,p_status public.order_status) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.order_status;begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 select status into v_old from public.orders where id=p_order_id for update;
 if not found or not ((v_old='pending' and p_status in ('confirmed','cancelled')) or (v_old='confirmed' and p_status in ('preparing','cancelled')) or (v_old='preparing' and p_status in ('ready','cancelled')) or (v_old='ready' and p_status='picked_up' and exists(select 1 from public.orders where id=p_order_id and fulfillment='pickup'))) then raise exception 'Cambio de estado no permitido';end if;
 update public.orders set status=p_status,confirmed_at=case when p_status='confirmed' then now() else confirmed_at end where id=p_order_id;
end $$;
create or replace function public.staff_assign_courier(p_order_id uuid,p_courier uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if not exists(select 1 from public.profiles where id=p_courier and role='courier' and active) then raise exception 'Repartidor no habilitado';end if;
 update public.orders set courier_id=p_courier,status='assigned',assigned_at=now() where id=p_order_id and fulfillment='delivery' and status='ready';
 if not found then raise exception 'Pedido no disponible para asignación';end if;
end $$;

create or replace function public.cash_open(p_opening integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_opening is null or p_opening<0 or exists(select 1 from public.cash_sessions where closed_at is null) then raise exception 'Caja abierta o fondo inválido';end if;
 insert into public.cash_sessions(opened_by,opening_cash) values(auth.uid(),p_opening) returning id into v_id;return v_id;
end $$;
create or replace function public.cash_movement(p_session uuid,p_kind text,p_method public.payment_method,p_amount integer,p_description text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if p_kind not in ('income','expense') or p_amount is null or p_amount<=0 or length(trim(coalesce(p_description,'')))<3 then raise exception 'Movimiento inválido';end if;
 if not exists(select 1 from public.cash_sessions where id=p_session and closed_at is null) then raise exception 'Caja cerrada';end if;
 insert into public.cash_movements(session_id,kind,method,amount,description,created_by) values(p_session,p_kind,p_method,case when p_kind='expense' then -p_amount else p_amount end,p_description,auth.uid());
end $$;
create or replace function public.cash_close(p_session uuid,p_counted integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() or p_counted is null or p_counted<0 then raise exception 'Cierre inválido';end if;
 update public.cash_sessions set closed_at=now(),closed_by=auth.uid(),counted_cash=p_counted where id=p_session and closed_at is null;
 if not found then raise exception 'Caja cerrada';end if;
end $$;

-- Prevent a client from choosing an arbitrary delivery fee; verify active tariff at order creation.
create or replace function public.validate_delivery_fee() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.fulfillment='pickup' and new.delivery_fee<>0 then raise exception 'Retiro sin tarifa de reparto';end if;
 if new.fulfillment='delivery' and not exists(select 1 from public.delivery_zones where fee=new.delivery_fee and active) then raise exception 'Tarifa de reparto no configurada';end if;
 return new;
end $$;
drop trigger if exists validate_delivery_fee on public.orders;
create trigger validate_delivery_fee before insert on public.orders for each row execute function public.validate_delivery_fee();

revoke execute on function public.attendance_issue_qr(),public.attendance_mark(text,numeric,numeric,numeric),public.attendance_override(uuid,text,text),public.staff_transition_order(uuid,public.order_status),public.staff_assign_courier(uuid,uuid),public.cash_open(integer),public.cash_movement(uuid,text,public.payment_method,integer,text),public.cash_close(uuid,integer) from public,anon;
grant execute on function public.attendance_issue_qr(),public.attendance_mark(text,numeric,numeric,numeric),public.attendance_override(uuid,text,text),public.staff_transition_order(uuid,public.order_status),public.staff_assign_courier(uuid,uuid),public.cash_open(integer),public.cash_movement(uuid,text,public.payment_method,integer,text),public.cash_close(uuid,integer) to authenticated;

-- Prices and delivery tariffs are owner decisions; staff may only toggle availability through RPC.
drop policy if exists products_manage on public.products;
create policy products_owner on public.products for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists options_manage on public.product_options;
create policy options_owner on public.product_options for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists groups_manage on public.option_groups;
create policy groups_owner on public.option_groups for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists zones_manage on public.delivery_zones;
create policy zones_owner on public.delivery_zones for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
alter view public.cash_close_summary set (security_invoker=true);
revoke all on public.cash_close_summary from anon;
grant select on public.cash_close_summary to authenticated;

create or replace function public.staff_set_availability(p_type text,p_id uuid,p_active boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() or p_active is null then raise exception 'No autorizado';end if;
 if p_type='product' then update public.products set active=p_active where id=p_id;
 elsif p_type='option' then update public.product_options set active=p_active where id=p_id;
 else raise exception 'Tipo inválido';end if;
 if not found then raise exception 'Elemento no encontrado';end if;
end $$;
revoke execute on function public.staff_set_availability(text,uuid,boolean) from public,anon;
grant execute on function public.staff_set_availability(text,uuid,boolean) to authenticated;
create unique index if not exists one_open_cash_session on public.cash_sessions ((true)) where closed_at is null;

-- Existing privileged functions were executable by anonymous users in the baseline audit.
revoke execute on function public.bootstrap_first_owner(), public.on_new_order(), public.on_order_status() from public,anon,authenticated;
revoke execute on function public."current_role"(),public.is_owner(),public.staff_can_manage(),public.courier_set_status(uuid,public.order_status),public.record_order_payment(uuid,uuid),public.staff_create_order(text,text,public.fulfillment,public.payment_method,jsonb,integer,text,numeric,numeric) from public,anon;
grant execute on function public."current_role"(),public.is_owner(),public.staff_can_manage(),public.courier_set_status(uuid,public.order_status),public.record_order_payment(uuid,uuid),public.staff_create_order(text,text,public.fulfillment,public.payment_method,jsonb,integer,text,numeric,numeric) to authenticated;
revoke execute on function public.validate_delivery_fee() from public,anon,authenticated;

-- A catalogue placeholder with price 0 must not slip through via a direct RPC call.
create or replace function public.validate_order_item_price() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.products where id=new.product_id and active and base_price>0) then
  raise exception 'Producto sin precio confirmado o agotado';
 end if;
 return new;
end $$;
drop trigger if exists validate_order_item_price on public.order_items;
create trigger validate_order_item_price before insert on public.order_items for each row execute function public.validate_order_item_price();
revoke execute on function public.validate_order_item_price() from public,anon,authenticated;
