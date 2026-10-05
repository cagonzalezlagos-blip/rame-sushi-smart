-- Apply independently in each business database after the base schema is installed.
-- The settings row is already protected by owner-only UPDATE and public read policies.
alter table public.settings
  add column if not exists brand_config jsonb not null default '{}'::jsonb;
alter table public.settings
  drop constraint if exists settings_brand_config_object;
alter table public.settings
  add constraint settings_brand_config_object check (jsonb_typeof(brand_config)='object');
