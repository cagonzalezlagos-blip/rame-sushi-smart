-- Run inside BEGIN after migration; terminate with ROLLBACK.
-- Synthetic route origin and tariff fixtures are never committed.
update public.settings set delivery_origin_lat=0,delivery_origin_lng=0,
 delivery_config='{"near_km":3,"far_km":5,"near_pay":1000,"mid_pay":1500,"far_pay":2000,"near_fee":0,"mid_fee":0,"far_fee":0}'::jsonb where id=1;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='owner' and active limit 1),true);
do $$
declare me uuid:=auth.uid();q uuid;v_order uuid;v_product uuid;v_settings public.settings%rowtype;v_items jsonb;v_shift uuid;before_count integer;
begin
 select * into v_settings from public.settings where id=1;
 if not public.valid_delivery_config(v_settings.delivery_config) or public.valid_delivery_config(null) then raise exception 'Test: settings validation';end if;
 select id into v_product from public.products where active and base_price>0 and category_id in(select id from public.categories where active) and not exists(select 1 from public.option_groups where product_id=products.id and active and min_select>0) limit 1;
 if v_product is null then raise exception 'Test: requires one uncustomized active product';end if;
 v_items:=jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1,'options','[]'::jsonb));
 select count(*) into before_count from public.orders;
 begin
  perform public.staff_create_order('__TEST_DELIVERY__','000000000','delivery','cash',v_items,0,'DOMICILIO_SIMULADO',v_settings.delivery_origin_lat+0.01,v_settings.delivery_origin_lng+0.01);
  raise exception 'Test: unquoted delivery accepted';
 exception when others then if sqlerrm not like '%Calcula y confirma%' then raise;end if;end;
 insert into public.delivery_quotes(user_id,address,lat,lng,origin_lat,origin_lng,distance_m,courier_pay,customer_fee,band_label,config_snapshot,provider)
 values(me,'DOMICILIO_SIMULADO',v_settings.delivery_origin_lat+0.01,v_settings.delivery_origin_lng+0.01,v_settings.delivery_origin_lat,v_settings.delivery_origin_lng,3000,1500,0,'3 a menos de 5 km',v_settings.delivery_config,'SIMULADO') returning id into q;
 v_order:=public.staff_create_delivery_order(q,'__TEST_DELIVERY__','000000000','cash',v_items,'pedidosya');
 if not exists(select 1 from public.orders where id=v_order and delivery_distance_m=3000 and courier_delivery_pay=1500 and delivery_fee=0 and source_channel='pedidosya') then raise exception 'Test: delivery snapshot or channel';end if;
 begin
  perform public.staff_create_delivery_order(q,'__TEST_DUPLICADO__','000000000','cash',v_items);
  raise exception 'Test: quote reused';
 exception when others then if sqlerrm not like '%venció o ya fue usado%' then raise;end if;end;
 if (select count(*) from public.orders)<>before_count+1 then raise exception 'Test: duplicate order';end if;
 begin
  update public.orders set courier_delivery_pay=1 where id=v_order;raise exception 'Test: payout changed';
 exception when others then if sqlerrm not like '%inmutable%' then raise;end if;end;
 update public.settings set delivery_config=jsonb_set(delivery_config,'{mid_pay}','1900') where id=1;
 if (select courier_delivery_pay from public.orders where id=v_order)<>1500 then raise exception 'Test: historical payout recalculated';end if;
 -- Delivery payout becomes earned only on completion and belongs to its shift.
 insert into public.time_entries(worker_id,hourly_rate,clock_in,clock_out) values(me,1000,now()-interval '1 minute',now()+interval '1 minute') returning id into v_shift;
 update public.orders set courier_id=me,status='out_for_delivery' where id=v_order;
 if exists(select 1 from public.courier_delivery_report((now() at time zone 'America/Santiago')::date) where order_id=v_order) then raise exception 'Test: uncompleted payout counted';end if;
 update public.orders set status='delivered' where id=v_order;
 if not exists(select 1 from public.courier_delivery_report((now() at time zone 'America/Santiago')::date) where order_id=v_order and courier_pay=1500) then raise exception 'Test: completed payout missing';end if;
 if not exists(select 1 from public.shift_delivery_payments(array[v_shift]) where amount=1500 and deliveries=1) then raise exception 'Test: shift payout';end if;
 update public.orders set payment_status=payment_status where id=v_order;
 if (select amount from public.shift_delivery_payments(array[v_shift]))<>1500 then raise exception 'Test: payout counted twice';end if;
 if has_function_privilege('anon','public.staff_create_delivery_order(uuid,text,text,public.payment_method,jsonb,text)','EXECUTE') then raise exception 'Test: anonymous creation';end if;
 if has_table_privilege('authenticated','public.delivery_quotes','SELECT') then raise exception 'Test: quotes exposed';end if;
 if not has_function_privilege('anon','public.public_business_settings()','EXECUTE') then raise exception 'Test: public branding missing';end if;
end $$;
select 'delivery_checks_passed' as result;
