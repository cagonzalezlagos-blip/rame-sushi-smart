create table public.delivery_areas(id uuid primary key default gen_random_uuid(),name text not null,polygon jsonb,commune text,fee integer not null check(fee between 0 and 1000000),priority integer not null default 10 check(priority between 0 and 1000),active boolean not null default true,updated_at timestamptz not null default now(),check((polygon is null)<>(commune is null)),check(length(trim(name)) between 1 and 100),check(commune is null or length(trim(commune)) between 2 and 100));
alter table public.delivery_areas enable row level security;
revoke all on public.delivery_areas from public,anon,authenticated;
grant select,insert,update on public.delivery_areas to authenticated;
create policy areas_staff_read on public.delivery_areas for select to authenticated using((select public.staff_can_manage()));
create policy areas_owner_insert on public.delivery_areas for insert to authenticated with check((select public.is_owner()));
create policy areas_owner_update on public.delivery_areas for update to authenticated using((select public.is_owner())) with check((select public.is_owner()));
create function public.valid_delivery_polygon(p jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb;a jsonb;b jsonb;c jsonb;d jsonb;n integer;i integer;j integer;area numeric:=0;ax numeric;ay numeric;bx numeric;byy numeric;cx numeric;cy numeric;dx numeric;dy numeric;
begin
 if p is null or coalesce(p->>'type','')<>'Polygon' or jsonb_typeof(p->'coordinates')<>'array' or jsonb_array_length(p->'coordinates')<>1 then return false;end if;
 r:=p->'coordinates'->0;if jsonb_typeof(r)<>'array' then return false;end if;n:=jsonb_array_length(r);if n not between 4 and 201 or r->0 is distinct from r->(n-1) then return false;end if;
 for a in select value from jsonb_array_elements(r) loop
 if jsonb_typeof(a)<>'array' or jsonb_array_length(a)<>2 or jsonb_typeof(a->0)<>'number' or jsonb_typeof(a->1)<>'number' or (a->>0)::numeric not between -180 and 180 or (a->>1)::numeric not between -90 and 90 then return false;end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(r))<>n-1 then return false;end if;
 for i in 0..n-2 loop
 a:=r->i;b:=r->(i+1);ax:=(a->>0)::numeric;ay:=(a->>1)::numeric;bx:=(b->>0)::numeric;byy:=(b->>1)::numeric;area:=area+ax*byy-bx*ay;
 for j in i+2..n-2 loop
 if i=0 and j=n-2 then continue;end if;c:=r->j;d:=r->(j+1);cx:=(c->>0)::numeric;cy:=(c->>1)::numeric;dx:=(d->>0)::numeric;dy:=(d->>1)::numeric;
 if ((bx-ax)*(cy-ay)-(byy-ay)*(cx-ax))*((bx-ax)*(dy-ay)-(byy-ay)*(dx-ax))<=0 and ((dx-cx)*(ay-cy)-(dy-cy)*(ax-cx))*((dx-cx)*(byy-cy)-(dy-cy)*(bx-cx))<=0 and greatest(least(ax,bx),least(cx,dx))<=least(greatest(ax,bx),greatest(cx,dx)) and greatest(least(ay,byy),least(cy,dy))<=least(greatest(ay,byy),greatest(cy,dy)) then return false;end if;
 end loop;end loop;
 return abs(area)>0.0000000001;
exception when others then return false;
end $$;
create function public.point_in_delivery_polygon(lat numeric,lng numeric,p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb:=p->'coordinates'->0;i integer;ax numeric;ay numeric;bx numeric;byy numeric;cross_value numeric;inside boolean:=false;
begin
 if lat is null or lng is null or r is null then return false;end if;
 for i in 0..jsonb_array_length(r)-2 loop
 ax:=(r->i->>0)::numeric;ay:=(r->i->>1)::numeric;bx:=(r->(i+1)->>0)::numeric;byy:=(r->(i+1)->>1)::numeric;
 cross_value:=(lng-ax)*(byy-ay)-(lat-ay)*(bx-ax);
 if abs(cross_value)<0.0000000001 and lng between least(ax,bx) and greatest(ax,bx) and lat between least(ay,byy) and greatest(ay,byy) then return true;end if;
 if (ay>lat)<>(byy>lat) then if lng<(bx-ax)*(lat-ay)/(byy-ay)+ax then inside:=not inside;end if;end if;
 end loop;return inside;
end $$;
create function public.validate_delivery_area() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.polygon is not null and not public.valid_delivery_polygon(new.polygon) then raise exception 'Polígono inválido: revisa sus puntos y cruces';end if;
 new.name:=trim(new.name);new.commune:=nullif(trim(new.commune),'');new.updated_at:=clock_timestamp();return new;
end $$;
create trigger validate_delivery_area before insert or update on public.delivery_areas for each row execute function public.validate_delivery_area();
revoke all on function public.validate_delivery_area() from public,anon,authenticated;
alter table public.delivery_quotes add column area_id uuid references public.delivery_areas(id);
alter table public.delivery_quotes add column area_snapshot jsonb;
alter table public.delivery_quotes add column commune text;
alter table public.delivery_quotes add column zone_priced boolean not null default false;
create index quotes_area on public.delivery_quotes(area_id);
create function public.choose_delivery_area(lat numeric,lng numeric,town text) returns public.delivery_areas language sql stable set search_path=public,pg_temp as $$
 select a from public.delivery_areas a where active and (polygon is not null and public.point_in_delivery_polygon(lat,lng,polygon) or polygon is null and lower(trim(commune))=lower(trim(town))) order by case when polygon is not null then 0 else 1 end,priority,id limit 1;
$$;
revoke all on function public.choose_delivery_area(numeric,numeric,text) from public,anon,authenticated;
create function public.valid_area_quote(q public.delivery_quotes) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.delivery_areas%rowtype;s public.settings%rowtype;tier text;fee integer;
begin
 if not q.zone_priced and exists(select 1 from public.delivery_areas where active) then return false;end if;
 a:=public.choose_delivery_area(q.lat,q.lng,q.commune);
 if q.area_id is distinct from a.id or q.area_snapshot is distinct from (case when a.id is not null then to_jsonb(a) end) then return false;end if;
 select * into s from public.settings where id=1;
 tier:=case when q.distance_m<(s.delivery_config->>'near_km')::numeric*1000 then 'near' when q.distance_m<(s.delivery_config->>'far_km')::numeric*1000 then 'mid' else 'far' end;
 fee:=coalesce(a.fee,(s.delivery_config->>(tier||'_fee'))::integer);
 return q.customer_fee=fee and q.courier_pay=(s.delivery_config->>(tier||'_pay'))::integer;
end $$;
revoke all on function public.valid_area_quote(public.delivery_quotes) from public,anon,authenticated;
create function public.staff_price_delivery_quote(p_quote uuid,p_commune text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.delivery_quotes%rowtype;a public.delivery_areas%rowtype;s public.settings%rowtype;tier text;base_label text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if length(coalesce(p_commune,''))>100 then raise exception 'Comuna inválida';end if;
 select * into q from public.delivery_quotes where id=p_quote and user_id=auth.uid() and used_order_id is null and expires_at>now() for update;
 if q.id is null then raise exception 'Cálculo vencido o utilizado';end if;
 select * into s from public.settings where id=1 for share;
 if q.config_snapshot is distinct from s.delivery_config or q.origin_lat is distinct from s.delivery_origin_lat or q.origin_lng is distinct from s.delivery_origin_lng then raise exception 'Recalcula con las tarifas vigentes';end if;
 a:=public.choose_delivery_area(q.lat,q.lng,p_commune);
 tier:=case when q.distance_m<(s.delivery_config->>'near_km')::numeric*1000 then 'near' when q.distance_m<(s.delivery_config->>'far_km')::numeric*1000 then 'mid' else 'far' end;
 base_label:=case when tier='near' then 'Menos de '||(s.delivery_config->>'near_km')||' km' when tier='mid' then (s.delivery_config->>'near_km')||' a menos de '||(s.delivery_config->>'far_km')||' km' else (s.delivery_config->>'far_km')||' km o más' end;
 update public.delivery_quotes set customer_fee=coalesce(a.fee,(s.delivery_config->>(tier||'_fee'))::integer),courier_pay=(s.delivery_config->>(tier||'_pay'))::integer,area_id=a.id,area_snapshot=case when a.id is not null then to_jsonb(a) end,commune=p_commune,zone_priced=true,band_label=case when a.id is not null then 'Zona: '||a.name||' · ' else '' end||base_label where id=q.id returning * into q;
 return jsonb_build_object('customer_fee',q.customer_fee,'courier_pay',q.courier_pay,'band_label',q.band_label,'area_name',a.name,'pricing',case when a.id is null then 'distance' when a.polygon is null then 'commune' else 'polygon' end);
end $$;
revoke all on function public.staff_price_delivery_quote(uuid,text) from public,anon;
grant execute on function public.staff_price_delivery_quote(uuid,text) to authenticated;

create table public.order_tracking_links(order_id uuid primary key references public.orders(id),token text not null unique check(token ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,created_by uuid not null references public.profiles(id));
alter table public.order_tracking_links enable row level security;
revoke all on public.order_tracking_links from public,anon,authenticated;
create policy tracking_internal_only on public.order_tracking_links for all to authenticated using(false) with check(false);
create index tracking_created_by on public.order_tracking_links(created_by);
create function public.staff_order_tracking_link(p_order uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare result text;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 perform 1 from public.orders where id=p_order and deleted_at is null for update;if not found then raise exception 'Pedido no disponible';end if;
 select token into result from public.order_tracking_links where order_id=p_order and expires_at>now();
 if result is null then
 result:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.order_tracking_links(order_id,token,expires_at,created_by) values(p_order,result,now()+interval '7 days',auth.uid()) on conflict(order_id) do update set token=excluded.token,expires_at=excluded.expires_at,created_by=excluded.created_by;
 end if;return result;
end $$;
create function public.public_order_tracking(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select jsonb_build_object('number',coalesce(o.daily_number,o.order_number),'status',o.status,'fulfillment',o.fulfillment,'updated_at',o.updated_at,'scheduled_at',o.scheduled_at,'business_name',s.business_name) into result from public.order_tracking_links l join public.orders o on o.id=l.order_id cross join public.settings s where s.id=1 and l.token=p_token and l.expires_at>now() and o.deleted_at is null;
 return result;
end $$;
revoke all on function public.staff_order_tracking_link(uuid),public.public_order_tracking(text) from public,anon;
grant execute on function public.staff_order_tracking_link(uuid) to authenticated;
grant execute on function public.public_order_tracking(text) to anon,authenticated;
create function public.staff_customer_order_history(p_phone text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if length(public.rame_phone_key(p_phone))<8 then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at desc),'[]'::jsonb) into result from (select id,created_at,daily_number,order_number,customer_name,customer_phone,delivery_address,fulfillment,subtotal,total,gift_sauces,chopsticks from public.orders where public.rame_phone_key(customer_phone)=public.rame_phone_key(p_phone) and deleted_at is null and status<>'cancelled' order by created_at desc limit 10) o;
 return result;
end $$;
revoke all on function public.staff_customer_order_history(text) from public,anon;
grant execute on function public.staff_customer_order_history(text) to authenticated;

create or replace function public.replace_order_delivery(p_order uuid,p_delivery jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
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
 if not public.valid_area_quote(q) then raise exception 'Tarifa no vigente';end if;
 fee:=q.customer_fee;pay:=q.courier_pay;lat:=q.lat;lng:=q.lng;
 end if;
 if o.payment_status<>'pending' and fee<>o.delivery_fee then raise exception 'Pedido pagado: la tarifa no puede cambiar. Mantén el cobro original';end if;
 previous:=current_setting('rame.replace_delivery',true);perform set_config('rame.replace_delivery',o.id::text,true);
 update public.orders set delivery_address=address,delivery_latitude=lat,delivery_longitude=lng,delivery_fee=fee,courier_delivery_pay=pay,delivery_distance_m=q.distance_m,delivery_quote_id=q.id,delivery_band_label=coalesce(q.band_label,'Tarifa manual'),manual_delivery=q.id is null,manual_delivery_reason=case when q.id is null then m->>'reason' end where id=o.id;
 perform set_config('rame.replace_delivery',coalesce(previous,''),true);
 if q.id is not null then update public.delivery_quotes set used_order_id=o.id where id=q.id;end if;
end $$;
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
 if not public.valid_area_quote(q) then raise exception 'El cálculo del tramo no coincide con las tarifas vigentes';end if;
 new.delivery_quote_id:=q.id;new.delivery_distance_m:=q.distance_m;new.courier_delivery_pay:=q.courier_pay;new.delivery_band_label:=q.band_label;
 update public.delivery_quotes set used_order_id=new.id where id=q.id;
 return new;
end $function$;
create function public.staff_dispatch_board() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 return jsonb_build_object('drivers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'on_shift',exists(select 1 from public.time_entries t where t.worker_id=p.id and t.clock_out is null),'load',(select count(*) from public.orders o where o.courier_id=p.id and o.deleted_at is null and o.status in ('assigned','out_for_delivery'))) order by p.full_name) from public.profiles p where p.role='courier' and p.active),'[]'::jsonb),'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'daily_number',o.daily_number,'order_number',o.order_number,'customer_name',o.customer_name,'delivery_address',o.delivery_address,'delivery_latitude',o.delivery_latitude,'delivery_longitude',o.delivery_longitude,'courier_id',o.courier_id,'status',o.status,'gift_sauces',o.gift_sauces,'chopsticks',o.chopsticks,'scheduled_at',o.scheduled_at) order by o.created_at) from public.orders o where o.fulfillment='delivery' and o.deleted_at is null and o.status in ('ready','assigned','out_for_delivery')),'[]'::jsonb));
end $$;
revoke all on function public.staff_dispatch_board() from public,anon;
grant execute on function public.staff_dispatch_board() to authenticated;
create or replace function public.staff_assign_courier(p_order_id uuid,p_courier uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 perform 1 from public.profiles where id=p_courier and role='courier' and active for share;
 if not found then raise exception 'Repartidor no habilitado';end if;
 update public.orders set courier_id=p_courier,status='assigned',assigned_at=now() where id=p_order_id and fulfillment='delivery' and status='ready' and deleted_at is null and courier_id is null;
 if not found then raise exception 'Pedido no disponible para asignación';end if;
end $$;

