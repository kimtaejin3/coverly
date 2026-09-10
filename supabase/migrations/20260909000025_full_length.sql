-- Whole-song generation, per account.
--
-- The pipeline has always been able to do it -- the worker treats duration <= 0 as "the whole
-- thing" -- but every cover was pinned to a 30 second preview. A full track costs several times
-- the GPU seconds, so this stays off by default and is opened one account at a time.
alter table public.users
  add column can_generate_full boolean not null default false;

comment on column public.users.can_generate_full is
  'Lets this account ask for a whole-song cover instead of the 30s preview.';

update public.users
   set can_generate_full = true
 where id = (select id from auth.users where email = 'rlaxowls1316@likelion.org');
