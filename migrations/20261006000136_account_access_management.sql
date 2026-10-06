-- Email-based account administration. Auth passwords remain in Supabase Auth.
create table public.access_audit (
 id bigint generated always as identity primary key,
 actor_id uuid,
 account_id uuid not null,
 action text not null,
 before_profile jsonb,
 after_profile jsonb,
 created_at timestamptz not null default now()
);
alter table public.access_audit enable row level security;
revoke all on public.access_audit from anon, authenticated;
grant select on public.access_audit to authenticated;
create policy access_audit_owner_read on public.access_audit for select to authenticated
 using ((select public.is_owner()));

create or replace function public.protect_profile_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(20261006,1);
 if tg_op<>'INSERT' and old.role='owner' and old.active then
  if tg_op='DELETE' or new.role<>'owner' or not new.active then
   if old.id=auth.uid() then raise exception 'No puedes quitar tu propio acceso de administrador'; end if;
   if not exists(select 1 from public.profiles where role='owner' and active and id<>old.id) then
    raise exception 'Debe quedar al menos un administrador activo';
   end if;
  end if;
 end if;
 if tg_op<>'DELETE' then
  if length(trim(new.full_name))<2 or length(new.full_name)>120 or new.hourly_rate<0 then
   raise exception 'Nombre o tarifa por hora inválidos';
  end if;
  return new;
 end if;
 return old;
end $$;
revoke all on function public.protect_profile_access() from public,anon,authenticated;
create trigger protect_profile_access before insert or update or delete on public.profiles
 for each row execute function public.protect_profile_access();

create or replace function public.audit_profile_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.access_audit(actor_id,account_id,action,before_profile,after_profile)
 values(auth.uid(),coalesce(new.id,old.id),tg_op,
  case when tg_op<>'INSERT' then to_jsonb(old) end,
  case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function public.audit_profile_access() from public,anon,authenticated;
create trigger audit_profile_access after insert or update or delete on public.profiles
 for each row execute function public.audit_profile_access();

create or replace function public.owner_list_access() returns table(
 id uuid,full_name text,role public.app_role,active boolean,hourly_rate integer,
 email text,email_confirmed boolean,password_created boolean
) language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede gestionar cuentas'; end if;
 return query select p.id,p.full_name,p.role,p.active,p.hourly_rate,u.email::text,
  u.email_confirmed_at is not null,coalesce(length(u.encrypted_password)>0,false)
 from public.profiles p join auth.users u on u.id=p.id order by p.full_name;
end $$;

create or replace function public.owner_account_for_email(p_email text)
 returns table(id uuid,has_profile boolean)
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede gestionar cuentas'; end if;
 return query select u.id,exists(select 1 from public.profiles p where p.id=u.id)
 from auth.users u where lower(u.email)=lower(trim(p_email));
end $$;

create or replace function public.owner_set_access(
 p_id uuid,p_full_name text,p_role public.app_role,p_active boolean,p_hourly_rate integer,p_expected jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare previous jsonb;
begin
 perform pg_advisory_xact_lock(20261006,1);
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede gestionar cuentas'; end if;
 select jsonb_build_object('full_name',full_name,'role',role,'active',active,'hourly_rate',hourly_rate)
 into previous from public.profiles where id=p_id for update;
 if previous is null then raise exception 'Cuenta no encontrada'; end if;
 if p_expected is distinct from previous then raise exception 'Esta cuenta cambió. Actualiza la lista antes de guardar'; end if;
 update public.profiles set full_name=trim(p_full_name),role=p_role,active=p_active,hourly_rate=p_hourly_rate where id=p_id;
end $$;
revoke all on function public.owner_list_access(),public.owner_account_for_email(text),public.owner_set_access(uuid,text,public.app_role,boolean,integer,jsonb) from public,anon;
grant execute on function public.owner_list_access(),public.owner_account_for_email(text),public.owner_set_access(uuid,text,public.app_role,boolean,integer,jsonb) to authenticated;
