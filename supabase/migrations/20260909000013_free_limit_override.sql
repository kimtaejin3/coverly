-- A per-account free allowance. Null means "use the app-wide default", so raising it for one
-- tester does not change the limit for everyone else.
alter table public.users
  add column free_generation_limit smallint;

comment on column public.users.free_generation_limit is
  'Overrides FREE_GENERATIONS_PER_ACCOUNT for this account when set.';
