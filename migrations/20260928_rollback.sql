-- Emergency rollback of the 20260928 operations migration.
-- Run only after restoring the former frontend; existing order/personnel data is preserved.
drop trigger if exists validate_order_item_price on public.order_items;
drop function if exists public.validate_order_item_price();
drop trigger if exists validate_delivery_fee on public.orders;
drop function if exists public.validate_delivery_fee();
-- Retain new tables, columns, attendance marks and functions to preserve recorded data.
alter view public.cash_close_summary set (security_invoker=false);
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_owner());
create policy entries_manage on public.time_entries for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff on public.orders for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists sessions_staff_read on public.cash_sessions;
create policy sessions_staff on public.cash_sessions for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists movements_staff_read on public.cash_movements;
create policy movements_staff on public.cash_movements for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists products_owner on public.products;
create policy products_manage on public.products for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists options_owner on public.product_options;
create policy options_manage on public.product_options for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists groups_owner on public.option_groups;
create policy groups_manage on public.option_groups for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
drop policy if exists zones_owner on public.delivery_zones;
create policy zones_manage on public.delivery_zones for all to authenticated using (public.staff_can_manage()) with check (public.staff_can_manage());
-- Keep the privilege revocations from the security fix; restoring anonymous EXECUTE is unsafe.
