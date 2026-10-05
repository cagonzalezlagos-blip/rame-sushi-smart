-- Run AFTER migration SQL in the SAME transaction; rollback the transaction afterwards.
-- Test rows and orders never become committed business records.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='owner' and active limit 1),true);
set local role authenticated;
do $$
declare
 v_product uuid:=gen_random_uuid();v_group uuid:=gen_random_uuid();v_option uuid:=gen_random_uuid();
 v_category uuid;v_order uuid;v_changes jsonb;v_expected jsonb;v_before jsonb;v_after jsonb;v_group_before jsonb;v_option_before jsonb;
begin
 select id into v_category from public.categories where active limit 1;
 v_changes:=jsonb_build_object('categories','[]'::jsonb,'products',jsonb_build_array(jsonb_build_object('id',v_product,'category_id',v_category,'name','__TEST_TABLA__','description','Prueba transaccional','base_price',10000,'image_url',null,'customizable',true,'active',true,'sort_order',99999)),
 'groups',jsonb_build_array(jsonb_build_object('id',v_group,'product_id',v_product,'name','Cambio de proteína','min_select',0,'max_select',1,'required',false,'sort_order',0,'active',true)),
 'options',jsonb_build_array(jsonb_build_object('id',v_option,'group_id',v_group,'name','Cambiar pollo por salmón','price_delta',700,'active',true,'sort_order',0)));
 v_expected:=jsonb_build_object('categories','{}'::jsonb,'products',jsonb_build_object(v_product::text,null),'groups',jsonb_build_object(v_group::text,null),'options',jsonb_build_object(v_option::text,null));
 if public.owner_apply_catalog(v_changes,v_expected)<>3 then raise exception 'Test: filas de carta';end if;
 v_order:=public.staff_create_order('__TEST_CLIENTE__','000000000','pickup','cash',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',2,'options',jsonb_build_array(jsonb_build_object('group_id',v_group,'option_id',v_option)))));
 if not exists(select 1 from public.order_items where order_id=v_order and unit_price=10700 and line_total=21400) then raise exception 'Test: recargo no sumado';end if;
 begin
  perform public.staff_create_order('__TEST_DUPLICADO__','000000000','pickup','cash',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1,'options',jsonb_build_array(jsonb_build_object('group_id',v_group,'option_id',v_option),jsonb_build_object('group_id',v_group,'option_id',v_option)))));
  raise exception 'Test: opción duplicada aceptada';
 exception when others then if sqlerrm not like '%Opciones repetidas%' then raise;end if;end;
 select to_jsonb(p) into v_before from public.products p where id=v_product;
 v_changes:=jsonb_build_object('categories','[]'::jsonb,'products',jsonb_build_array(jsonb_set(v_before,'{base_price}','11000')),'groups','[]'::jsonb,'options','[]'::jsonb);
 v_expected:=jsonb_build_object('categories','{}'::jsonb,'products',jsonb_build_object(v_product::text,v_before),'groups','{}'::jsonb,'options','{}'::jsonb);
 perform public.owner_apply_catalog(v_changes,v_expected);
 if not exists(select 1 from public.order_items where order_id=v_order and unit_price=10700) then raise exception 'Test: pedido anterior modificado';end if;
 begin
  perform public.owner_apply_catalog(v_changes,v_expected);
  raise exception 'Test: conflicto no detectado';
 exception when others then if sqlerrm not like '%cambió en otra sesión%' then raise;end if;end;
 select to_jsonb(p) into v_after from public.products p where id=v_product;
 select to_jsonb(o) into v_option_before from public.product_options o where id=v_option;
 v_changes:=jsonb_build_object('categories','[]'::jsonb,'products',jsonb_build_array(jsonb_set(v_after,'{base_price}','12000')),'groups','[]'::jsonb,'options',jsonb_build_array(jsonb_set(v_option_before,'{price_delta}','-1')));
 v_expected:=jsonb_build_object('categories','{}'::jsonb,'products',jsonb_build_object(v_product::text,v_after),'groups','{}'::jsonb,'options',jsonb_build_object(v_option::text,v_option_before));
 begin
  perform public.owner_apply_catalog(v_changes,v_expected);
  raise exception 'Test: recargo negativo aceptado';
 exception when others then if sqlerrm not like '%Recargo inválido%' then raise;end if;end;
 if (select base_price from public.products where id=v_product)<>11000 then raise exception 'Test: importación parcial';end if;
 select to_jsonb(g) into v_group_before from public.option_groups g where id=v_group;
 v_changes:=jsonb_build_object('categories','[]'::jsonb,'products','[]'::jsonb,'groups',jsonb_build_array(jsonb_set(v_group_before,'{active}','false')),'options','[]'::jsonb);
 v_expected:=jsonb_build_object('categories','{}'::jsonb,'products','{}'::jsonb,'groups',jsonb_build_object(v_group::text,v_group_before),'options','{}'::jsonb);
 perform public.owner_apply_catalog(v_changes,v_expected);
 v_order:=public.staff_create_order('__TEST_SIN_CAMBIOS__','000000000','pickup','cash',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1,'options','[]'::jsonb)));
 if not exists(select 1 from public.order_items where order_id=v_order and unit_price=11000) then raise exception 'Test: grupo deshabilitado';end if;
 begin
  perform public.staff_create_order('__TEST_ARCHIVADO__','000000000','pickup','cash',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1,'options',jsonb_build_array(jsonb_build_object('group_id',v_group,'option_id',v_option)))));
  raise exception 'Test: opción archivada aceptada';
 exception when others then if sqlerrm not like '%ya no están disponibles%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.owner_apply_catalog(v_changes,v_expected);
  raise exception 'Test: usuario sin autorización editó carta';
 exception when others then if sqlerrm not like '%Solo administración%' then raise;end if;end;
end $$;
reset role;
