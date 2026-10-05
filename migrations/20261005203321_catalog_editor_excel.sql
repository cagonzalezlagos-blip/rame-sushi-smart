-- Extends the existing business catalog. No product, price or existing order is changed.
alter table public.option_groups add column if not exists active boolean not null default true;

drop policy if exists categories_manage on public.categories;
drop policy if exists categories_owner on public.categories;
create policy categories_owner on public.categories for all to authenticated
 using ((select public.is_owner())) with check ((select public.is_owner()));

-- A single RPC keeps a product, its changes and its surcharges in one transaction.
-- SECURITY INVOKER preserves the owner-only RLS policies on all four tables.
create or replace function public.owner_apply_catalog(p_changes jsonb,p_expected jsonb) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_kind text;v_table text;v_fields text[];v_row jsonb;v_existing jsonb;v_expected jsonb;
 v_id uuid;v_assignments text;v_columns text;v_count integer:=0;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede editar la carta';end if;
 if coalesce(jsonb_typeof(p_changes),'')<>'object' or coalesce(jsonb_typeof(p_expected),'')<>'object' then raise exception 'Cambios inválidos';end if;
 perform pg_advisory_xact_lock(709103);
 foreach v_kind in array array['categories','products','groups','options'] loop
  if coalesce(jsonb_typeof(p_changes->v_kind),'')<>'array' or coalesce(jsonb_typeof(p_expected->v_kind),'')<>'object' then raise exception 'Formato inválido: %',v_kind;end if;
  if jsonb_array_length(p_changes->v_kind)>3000 then raise exception 'Demasiados cambios';end if;
  case v_kind
   when 'categories' then v_table:='categories';v_fields:=array['id','name','sort_order','active'];
   when 'products' then v_table:='products';v_fields:=array['id','category_id','name','description','base_price','image_url','customizable','active','sort_order'];
   when 'groups' then v_table:='option_groups';v_fields:=array['id','product_id','name','min_select','max_select','required','sort_order','active'];
   when 'options' then v_table:='product_options';v_fields:=array['id','group_id','name','price_delta','active','sort_order'];
  end case;
  if exists(select 1 from jsonb_array_elements(p_changes->v_kind) x group by x->>'id' having count(*)>1) then raise exception 'Código repetido en %',v_kind;end if;
  select string_agg(format('%I',f),',') into v_columns from unnest(v_fields) f;
  select string_agg(format('%I=excluded.%I',f,f),',') into v_assignments from unnest(v_fields) f where f<>'id';
  for v_row in select value from jsonb_array_elements(p_changes->v_kind) loop
   if jsonb_typeof(v_row)<>'object' or not (v_row ?& v_fields) then raise exception 'Registro incompleto en %',v_kind;end if;
   v_id:=(v_row->>'id')::uuid;
   if v_id is null or not ((p_expected->v_kind) ? v_id::text) then raise exception 'Falta referencia del registro';end if;
   execute format('select to_jsonb(t) from public.%I t where id=$1 for update',v_table) into v_existing using v_id;
   v_expected:=p_expected->v_kind->v_id::text;
   if coalesce(v_existing,'null'::jsonb) is distinct from v_expected then raise exception 'La carta cambió en otra sesión. Recarga y revisa: %',v_row->>'name';end if;
   if length(trim(coalesce(v_row->>'name','')))=0 or length(v_row->>'name')>150 or jsonb_typeof(v_row->'active')<>'boolean' or (v_row->>'sort_order')::integer not between 0 and 100000 or v_row->>'sort_order' is null then raise exception 'Nombre, disponibilidad u orden inválidos';end if;
   if v_kind='products' then
    if v_row->>'base_price' is null or (v_row->>'base_price')::integer not between 0 and 1000000000 or length(coalesce(v_row->>'description',''))>2000 or (coalesce(v_row->>'image_url','')<>'' and v_row->>'image_url' !~ '^https://[^[:space:]]+$') then raise exception 'Precio, descripción o imagen inválidos';end if;
    if (v_row->>'active')::boolean and v_row->>'category_id' is null then raise exception 'Selecciona una categoría para el producto';end if;
   elsif v_kind='groups' then
    if v_row->>'min_select' is null or v_row->>'max_select' is null or (v_row->>'min_select')::integer not between 0 and 100 or (v_row->>'max_select')::integer not between 1 and 100 or (v_row->>'max_select')::integer<(v_row->>'min_select')::integer then raise exception 'Límites del grupo inválidos';end if;
    v_row:=jsonb_set(v_row,'{required}',to_jsonb((v_row->>'min_select')::integer>0));
   elsif v_kind='options' then
    if v_row->>'price_delta' is null or (v_row->>'price_delta')::integer not between 0 and 1000000000 then raise exception 'Recargo inválido';end if;
   end if;
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',v_table,v_columns,v_columns,v_table,v_assignments) using v_row;
   v_count:=v_count+1;
  end loop;
 end loop;
 if exists(select 1 from public.categories group by lower(trim(name)) having count(*)>1) then raise exception 'Las categorías deben tener nombres distintos';end if;
 if exists(
  select 1 from public.option_groups g join public.products p on p.id=g.product_id
  where g.active and p.active and g.min_select>(select count(*) from public.product_options o where o.group_id=g.id)
 ) then raise exception 'Un grupo exige más opciones de las configuradas';end if;
 return v_count;
end $$;
revoke execute on function public.owner_apply_catalog(jsonb,jsonb) from public,anon;
grant execute on function public.owner_apply_catalog(jsonb,jsonb) to authenticated;

-- Archived groups do not appear in new orders; prices remain server-calculated.
create or replace function public.staff_create_order(
 p_customer_name text,p_customer_phone text,p_fulfillment public.fulfillment,p_payment public.payment_method,p_items jsonb,
 p_delivery_fee integer default 0,p_address text default null,p_lat numeric default null,p_lng numeric default null
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_item jsonb;v_product public.products%rowtype;v_option jsonb;
 v_group public.option_groups%rowtype;v_opt public.product_options%rowtype;
 v_selected jsonb;v_selected_options jsonb;v_unit integer;v_subtotal integer:=0;v_count integer;v_quantity integer;v_options jsonb;
begin
 if auth.uid() is null or not public.staff_can_manage() then raise exception 'No autorizado';end if;
 if length(trim(coalesce(p_customer_name,'')))<2 or length(trim(coalesce(p_customer_phone,'')))<8 then raise exception 'Nombre y teléfono requeridos';end if;
 if coalesce(jsonb_typeof(p_items),'')<>'array' then raise exception 'Carrito inválido';end if;
 if jsonb_array_length(p_items) not between 1 and 50 or p_delivery_fee is null or p_delivery_fee<0 or (p_fulfillment='delivery' and coalesce(trim(p_address),'')='') then raise exception 'Pedido o entrega inválidos';end if;
 insert into public.orders(customer_name,customer_phone,fulfillment,payment_method,subtotal,delivery_fee,delivery_address,delivery_latitude,delivery_longitude,created_by)
 values(p_customer_name,p_customer_phone,p_fulfillment,p_payment,0,p_delivery_fee,p_address,p_lat,p_lng,auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active and base_price>0 for share;
  if not found or not exists(select 1 from public.categories where id=v_product.category_id and active) then raise exception 'Producto no disponible o sin precio';end if;
  v_quantity:=(v_item->>'quantity')::integer;
  if v_quantity is null or v_quantity not between 1 and 30 then raise exception 'Cantidad inválida';end if;
  v_options:=coalesce(v_item->'options','[]'::jsonb);
  if jsonb_typeof(v_options)<>'array' then raise exception 'Opciones inválidas';end if;
  if exists(select 1 from jsonb_array_elements(v_options) x group by x->>'option_id' having count(*)>1) then raise exception 'Opciones repetidas';end if;
  if exists(
   select 1 from jsonb_array_elements(v_options) x where not exists(
    select 1 from public.product_options o join public.option_groups g on g.id=o.group_id
    where o.id=(x->>'option_id')::uuid and g.id=(x->>'group_id')::uuid and g.product_id=v_product.id and g.active and o.active
   )
  ) then raise exception 'Los cambios del producto ya no están disponibles. Revisa el pedido';end if;
  v_unit:=v_product.base_price;v_selected_options:='[]'::jsonb;
  for v_group in select * from public.option_groups where product_id=v_product.id and active order by sort_order,id for share loop
   select coalesce(jsonb_agg(x),'[]'::jsonb) into v_selected from jsonb_array_elements(v_options) x where x->>'group_id'=v_group.id::text;
   v_count:=jsonb_array_length(v_selected);
   if v_count<v_group.min_select or v_count>v_group.max_select then raise exception 'Revisa la selección de %',v_group.name;end if;
   for v_option in select value from jsonb_array_elements(v_selected) loop
    select * into v_opt from public.product_options where id=(v_option->>'option_id')::uuid and group_id=v_group.id and active for share;
    if not found then raise exception 'Opción no disponible';end if;
    v_unit:=v_unit+v_opt.price_delta;
    v_selected_options:=v_selected_options||jsonb_build_array(jsonb_build_object('group',v_group.name,'name',v_opt.name,'price_delta',v_opt.price_delta));
   end loop;
  end loop;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,notes,selected_options,line_total)
  values(v_id,v_product.id,v_product.name,v_quantity,v_unit,left(coalesce(v_item->>'notes',''),500),v_selected_options,v_unit*v_quantity);
  v_subtotal:=v_subtotal+v_unit*v_quantity;
 end loop;
 update public.orders set subtotal=v_subtotal where id=v_id;
 return v_id;
end $$;
revoke execute on function public.staff_create_order(text,text,public.fulfillment,public.payment_method,jsonb,integer,text,numeric,numeric) from public,anon;
grant execute on function public.staff_create_order(text,text,public.fulfillment,public.payment_method,jsonb,integer,text,numeric,numeric) to authenticated;
