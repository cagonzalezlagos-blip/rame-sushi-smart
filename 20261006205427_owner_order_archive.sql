alter table public.orders add column deleted_at timestamptz;
alter table public.orders add column deleted_by uuid references public.profiles(id);
alter table public.orders add column deletion_reason text;
create table public.order_archive_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 actor_id uuid not null references public.profiles(id),
 action text not null check(action in ('delete','restore')),
 reason text not null,
 created_at timestamptz not null default now()
);
alter table public.order_archive_events enable row level security;
revoke all on public.order_archive_events from public,anon,authenticated;
grant select on public.order_archive_events to authenticated;
create policy owner_archive_read on public.order_archive_events for select to authenticated using ((select public.is_owner()));

-- Privileged operation is necessary: staff table access is intentionally read-only.
-- The caller is checked against the active server-side profile on every call.
create function public.owner_archive_order(p_order uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype; begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede eliminar pedidos';end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>500 then raise exception 'Indica un motivo de 3 a 500 caracteres';end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'Pedido no encontrado';end if;
 if o.deleted_at is not null then raise exception 'El pedido ya está eliminado';end if;
 if o.status in ('assigned','out_for_delivery') or (o.courier_id is not null and o.status not in ('delivered','picked_up','cancelled')) then raise exception 'Finaliza o resuelve el reparto antes de eliminar';end if;
 perform id from public.print_jobs where order_id=o.id for update;
 if exists(select 1 from public.print_jobs where order_id=o.id and status='claimed') then raise exception 'La comanda se está imprimiendo; revisa su estado antes de eliminar';end if;
 update public.print_jobs set status='failed',error='Pedido eliminado por administración; no imprimir' where order_id=o.id and status='pending';
 update public.orders set status=case when status in ('pending','confirmed','preparing','ready') then 'cancelled'::public.order_status else status end,deleted_at=now(),deleted_by=auth.uid(),deletion_reason=trim(p_reason) where id=o.id;
 insert into public.order_archive_events(order_id,actor_id,action,reason) values(o.id,auth.uid(),'delete',trim(p_reason));
end $$;
create function public.owner_restore_order(p_order uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Solo administración puede recuperar pedidos';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.deleted_at is null then raise exception 'El pedido no está eliminado';end if;
 update public.orders set deleted_at=null,deleted_by=null,deletion_reason=null where id=o.id;
 insert into public.order_archive_events(order_id,actor_id,action,reason) values(o.id,auth.uid(),'restore','Recuperado; se conserva el estado y no se vuelve a cobrar ni imprimir');
end $$;
revoke execute on function public.owner_archive_order(uuid,text),public.owner_restore_order(uuid) from public,anon;
grant execute on function public.owner_archive_order(uuid,text),public.owner_restore_order(uuid) to authenticated;

create function public.protect_archived_order() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.deleted_at is not null and (new.status is distinct from old.status or new.payment_status is distinct from old.payment_status or new.courier_id is distinct from old.courier_id or new.source_channel is distinct from old.source_channel) then raise exception 'Recupera el pedido eliminado antes de modificarlo';end if;
 return new;
end $$;
revoke execute on function public.protect_archived_order() from public,anon,authenticated;
create trigger protect_archived_order before update on public.orders for each row execute function public.protect_archived_order();
