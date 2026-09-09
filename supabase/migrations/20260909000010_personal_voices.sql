-- Personal voices: a user records themselves and the worker trains a model from it.
--
-- Kept private to their owner on purpose. A catalogue voice is one we hold rights to; a personal
-- voice is whatever someone recorded, and letting those into a shared catalogue is how a service
-- ends up hosting a clone of someone who never agreed to it (PRD §4).
create type public.voice_status as enum ('queued', 'training', 'ready', 'failed');

alter table public.voices
  add column owner_user_id uuid references public.users (id) on delete cascade,
  add column status public.voice_status not null default 'ready',
  add column training_audio_url text,
  add column error_message text,
  add column created_by_recording boolean not null default false;

create index voices_owner_idx on public.voices (owner_user_id) where owner_user_id is not null;

comment on column public.voices.owner_user_id is
  'Null for the catalogue. Set for a personal voice, which only its owner may see or use.';

-- The old policy exposed every active voice; a personal voice must not appear for anyone else.
drop policy if exists "anyone reads active voices" on public.voices;

create policy "anyone reads the catalogue"
  on public.voices for select
  using (is_active and owner_user_id is null);

create policy "owner reads own voices"
  on public.voices for select
  using (owner_user_id = (select auth.uid()));
