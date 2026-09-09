-- The free allowance is a count now, not a yes/no. `free_generation_used` could only ever say
-- "spent", so raising the limit required a column that can hold how many have been used.
alter table public.users
  add column free_generations_used integer not null default 0 check (free_generations_used >= 0);

-- Anyone who had already spent their single free generation starts at 1, not 0, so nobody is
-- silently handed an extra one on top of what they already took.
update public.users set free_generations_used = 1 where free_generation_used;

comment on column public.users.free_generations_used is
  'Free previews consumed. The limit itself lives in the app (PRICING/PREVIEW config), not here, '
  'so it can be tuned without a migration.';
