-- Transaction fixtures are fully rolled back. Never print or deliver these orders.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='owner' and active limit 1),true);
do $$ declare area uuid;commune_area uuid;qid uuid;o uuid;pid uuid;s public.settings%rowtype;q public.delivery_quotes%rowtype;priced jsonb;payload jsonb;token text;report jsonb;driver uuid;begin
 if not public.valid_delivery_polygon('{"type":"Polygon","coordinates":[[[-72,-34],[-70,-34],[-70,-32],[-72,-32],[-72,-34]]]}') or public.valid_delivery_polygon('{"type":"Polygon","coordinates":[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}') then raise exception 'Polygon validation failed';end if;
 if not public.point_in_delivery_polygon(-33,-71,'{"type":"Polygon","coordinates":[[[-72,-34],[-70,-34],[-70,-32],[-72,-32],[-72,-34]]]}') or not public.point_in_delivery_polygon(-34,-72,'{"type":"Polygon","coordinates":[[[-72,-34],[-70,-34],[-70,-32],[-72,-32],[-72,-34]]]}') or public.point_in_delivery_polygon(-35,-71,'{"type":"Polygon","coordinates":[[[-72,-34],[-70,-34],[-70,-32],[-72,-32],[-72,-34]]]}') then raise exception 'Polygon boundaries failed';end if;
 insert into public.delivery_areas(name,polygon,fee,priority) values('PRUEBA ZONA','{"type":"Polygon","coordinates":[[[-72,-34],[-70,-34],[-70,-32],[-72,-32],[-72,-34]]]}',3210,0) returning id into area;
 insert into public.delivery_areas(name,commune,fee,priority) values('PRUEBA COMUNA','COMUNA PRUEBA',4321,0) returning id into commune_area;
 select * into s from public.settings where id=1;
 insert into public.delivery_quotes(user_id,address,lat,lng,origin_lat,origin_lng,distance_m,courier_pay,customer_fee,band_label,config_snapshot,provider,expires_at) values(auth.uid(),'PRUEBA LOGISTICA 123',-33,-71,s.delivery_origin_lat,s.delivery_origin_lng,1000,0,0,'fixture',s.delivery_config,'test',now()+interval '20 minutes') returning id into qid;
 priced:=public.staff_price_delivery_quote(qid,'COMUNA PRUEBA');select * into q from public.delivery_quotes where id=qid;
 if q.customer_fee<>3210 or q.courier_pay<>(s.delivery_config->>'near_pay')::integer or not public.valid_area_quote(q) or priced->>'pricing'<>'polygon' then raise exception 'Zone pricing mismatch';end if;
 update public.delivery_areas set fee=3211 where id=area;if public.valid_area_quote(q) then raise exception 'Stale area quote accepted';end if;
 perform public.staff_price_delivery_quote(qid,'COMUNA PRUEBA');
 select id into pid from public.products p where active and base_price>0 and not exists(select 1 from public.option_groups g where g.product_id=p.id and g.active and g.min_select>0) limit 1;
 if not exists(select 1 from public.cash_sessions where closed_at is null) then perform public.cash_open(0);end if;
 payload:=jsonb_build_object('name','PRUEBA LOGISTICA','phone','900000002','fulfillment','delivery','channel','counter','quote_id',qid,'items',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',1,'options','[]'::jsonb)),'gift_sauces','[{"name":"Soya","quantity":2}]'::jsonb,'chopsticks',2);
 o:=public.staff_submit_order(payload,gen_random_uuid());if (select delivery_fee from public.orders where id=o)<>3211 then raise exception 'Zone order rejected';end if;
 token:=public.staff_order_tracking_link(o);if length(token)<>64 or token<>public.staff_order_tracking_link(o) then raise exception 'Tracking token unstable';end if;
 report:=public.public_order_tracking(token);if report->>'status'<>'confirmed' or report ? 'customer_name' or report ? 'delivery_address' or report ? 'customer_phone' or report ? 'id' then raise exception 'Tracking disclosure';end if;
 if public.public_order_tracking(repeat('0',64)) is not null or public.public_order_tracking('bad') is not null then raise exception 'Invalid tracking visible';end if;
 if jsonb_array_length(public.staff_customer_order_history('+56 9 0000 0002'))<>1 then raise exception 'Customer history missing';end if;
 perform public.staff_transition_order(o,'preparing');perform public.staff_transition_order(o,'ready');report:=public.staff_dispatch_board();if not exists(select 1 from jsonb_array_elements(report->'orders') r where r->>'id'=o::text) then raise exception 'Dispatch missing ready order';end if;
 select id into driver from public.profiles where role='courier' and active limit 1;if driver is not null then perform public.staff_assign_courier(o,driver);if (select status from public.orders where id=o)<>'assigned' then raise exception 'Assignment failed';end if;begin perform public.staff_assign_courier(o,driver);raise exception 'Double assignment accepted';exception when others then if sqlerrm not like '%no disponible%' then raise;end if;end;end if;
 update public.delivery_quotes set lat=-35,lng=-71,used_order_id=null where id=qid;priced:=public.staff_price_delivery_quote(qid,'comuna prueba');if (priced->>'customer_fee')::integer<>4321 or priced->>'pricing'<>'commune' then raise exception 'Commune fallback failed';end if;
 priced:=public.staff_price_delivery_quote(qid,'otra');if (priced->>'customer_fee')::integer<>(s.delivery_config->>'near_fee')::integer or priced->>'pricing'<>'distance' then raise exception 'Distance fallback failed';end if;
 update public.order_tracking_links set expires_at=now()-interval '1 second' where order_id=o;if public.public_order_tracking(token) is not null then raise exception 'Expired tracking visible';end if;
end $$;
set local role anon;
do $$ begin
 if public.public_order_tracking('bad') is not null then raise exception 'Invalid anonymous access';end if;
 begin perform public.staff_customer_order_history('900000002');raise exception 'Anonymous history allowed';exception when insufficient_privilege then null;end;
 begin perform public.staff_dispatch_board();raise exception 'Anonymous dispatch allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.order_tracking_links;raise exception 'Tracking table exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: polygon/commune/distance price, stale quotes, registered zone order, history, dispatch, tracking privacy and expiry' result;
select set_config('rame.test_nonstaff',coalesce((select id::text from public.profiles where role in ('worker','courier') and active limit 1),''),true);
select set_config('rame.test_cashier',coalesce((select id::text from public.profiles where role='cashier' and active limit 1),''),true);
set local role authenticated;
do $$ begin
 if current_setting('rame.test_cashier')<>'' then
 perform set_config('request.jwt.claim.sub',current_setting('rame.test_cashier'),true);
 perform public.staff_dispatch_board();perform public.staff_customer_order_history('900000002');
 begin insert into public.delivery_areas(name,commune,fee) values('PRUEBA NO PERMITIDA','TEST',0);raise exception 'Cashier created zone';exception when insufficient_privilege then null;end;
 end if;
 if current_setting('rame.test_nonstaff')<>'' then
 perform set_config('request.jwt.claim.sub',current_setting('rame.test_nonstaff'),true);
 begin perform public.staff_dispatch_board();raise exception 'Worker dispatch allowed';exception when others then if sqlerrm<>'No autorizado' then raise;end if;end;
 begin perform public.staff_customer_order_history('900000002');raise exception 'Worker history allowed';exception when others then if sqlerrm<>'No autorizado' then raise;end if;end;
 end if;
end $$;
reset role;
select 'PASS: logistics pricing/tracking/history/dispatch and role restrictions' result;
