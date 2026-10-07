create or replace function public.choose_delivery_area(lat numeric,lng numeric,town text) returns public.delivery_areas language sql stable set search_path=public,pg_temp as $$
 select a from public.delivery_areas a where active and (polygon is not null and public.point_in_delivery_polygon(lat,lng,polygon) or polygon is null and lower(translate(trim(commune),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'))=lower(translate(trim(town),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'))) order by case when polygon is not null then 0 else 1 end,priority,id limit 1;
$$;
create index orders_customer_history_phone on public.orders(public.rame_phone_key(customer_phone),created_at desc) where deleted_at is null and status<>'cancelled';
