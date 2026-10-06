-- Execute after migration inside BEGIN; finish with ROLLBACK. No test data persists.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='owner' and active limit 1),true);
set local role authenticated;
do $$
declare me uuid:=auth.uid();target uuid;v jsonb;count_before integer;
begin
 select id into target from public.profiles where id<>me limit 1;
 select count(*) into count_before from public.owner_list_access();
 if count_before<1 then raise exception 'Test: admin list empty';end if;
 if not exists(select 1 from public.owner_account_for_email('ca.gonzalez.lagos@gmail.com') where has_profile) then raise exception 'Test: email lookup';end if;
 select jsonb_build_object('full_name',full_name,'role',role,'active',active,'hourly_rate',hourly_rate) into v from public.profiles where id=me;
 begin
  perform public.owner_set_access(me,v->>'full_name','worker',true,(v->>'hourly_rate')::int,v);
  raise exception 'Test: self demotion allowed';
 exception when others then if sqlerrm not like '%propio acceso%' then raise;end if;end;
 if target is not null then
  select jsonb_build_object('full_name',full_name,'role',role,'active',active,'hourly_rate',hourly_rate) into v from public.profiles where id=target;
  perform public.owner_set_access(target,'__TEST_ACCESO__','cashier',true,1000,v);
  if not exists(select 1 from public.owner_list_access() where id=target and role='cashier' and hourly_rate=1000) then raise exception 'Test: profile save';end if;
  if not exists(select 1 from public.access_audit where account_id=target and actor_id=me and after_profile->>'full_name'='__TEST_ACCESO__') then raise exception 'Test: audit missing';end if;
  begin
   perform public.owner_set_access(target,'__TEST_ACCESO__','courier',true,2000,v);
   raise exception 'Test: stale changes allowed';
  exception when others then if sqlerrm not like '%cambió%' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',target::text,true);
  begin
   perform public.owner_list_access();raise exception 'Test: cashier read emails allowed';
  exception when others then if sqlerrm not like '%Solo administración%' then raise;end if;end;
  begin
   perform public.owner_account_for_email('ca.gonzalez.lagos@gmail.com');raise exception 'Test: cashier email lookup allowed';
  exception when others then if sqlerrm not like '%Solo administración%' then raise;end if;end;
  if exists(select 1 from public.access_audit) then raise exception 'Test: cashier audit read allowed';end if;
  perform set_config('request.jwt.claim.sub',me::text,true);
 end if;
end $$;
reset role;
-- Trigger enforces last-owner protection even for direct server-side SQL.
do $$ declare last_id uuid;
begin
 perform set_config('request.jwt.claim.sub','',true);
 select id into last_id from public.profiles where role='owner' and active limit 1;
 update public.profiles set role='worker' where role='owner' and active and id<>last_id;
 begin
  update public.profiles set active=false where id=last_id;
  raise exception 'Test: last admin disabled';
 exception when others then if sqlerrm not like '%al menos un administrador%' then raise;end if;end;
 begin
  delete from public.profiles where id=last_id;
  raise exception 'Test: last admin deleted';
 exception when others then if sqlerrm not like '%al menos un administrador%' then raise;end if;end;
 if has_function_privilege('anon','public.owner_list_access()','EXECUTE') then raise exception 'Test: anonymous access';end if;
end $$;
select 'account_access_checks_passed' as result;
