-- Coverly Phase 2 schema (PRD §32).
--
-- Two deliberate departures from the PRD:
--   * no `cover_likes` and no `visibility`/`like_count` on covers — Explore was dropped, so nothing
--     is ever published and there is nothing to like. Covers are private to their creator and the
--     user decides whether to share the file they download.
--   * `public.users` mirrors `auth.users` rather than replacing it; Supabase owns authentication.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  email                 text,
  username              text unique,
  avatar_url            text,
  credit_balance        integer not null default 0 check (credit_balance >= 0),
  free_generation_used  boolean not null default false,
  created_at            timestamptz not null default now()
);

comment on column public.users.free_generation_used is
  'One free 30s preview per account (PRD §12). IP-based limiting lives in the API, not here.';

-- Every auth signup gets a profile row; without this the first insert would race the first request.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- voices — the public catalogue; every row is a voice we own or licensed (PRD §4)
-- ---------------------------------------------------------------------------
create table public.voices (
  id               text primary key,
  name             text not null,
  description      text not null default '',
  gender           text not null check (gender in ('male', 'female', 'neutral')),
  tags             text[] not null default '{}',
  sample_url       text,
  thumbnail_url    text,
  -- Points at the fine-tuned checkpoint the worker loads for this voice.
  model_reference  text,
  -- Vocal range the voice was trained on. Songs far outside it convert poorly, which is the
  -- failure we measured in Phase 0, so the app surfaces it and the worker can act on it.
  range_label      text,
  accent           text not null default '',
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- covers
-- ---------------------------------------------------------------------------
create type public.cover_type as enum ('preview', 'full');
create type public.cover_status as enum ('queued', 'processing', 'completed', 'failed');

create table public.covers (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users (id) on delete cascade,
  voice_id                  text not null references public.voices (id),
  title                     text not null default '',
  original_file_url         text,
  preview_start_seconds     integer not null default 30,
  preview_duration_seconds  integer not null default 30,
  pitch_shift               integer not null default 0,
  result_url                text,
  type                      public.cover_type not null default 'preview',
  status                    public.cover_status not null default 'queued',
  created_at                timestamptz not null default now(),
  completed_at              timestamptz
);

create index covers_user_created_idx on public.covers (user_id, created_at desc);
create index covers_status_idx on public.covers (status) where status in ('queued', 'processing');

-- ---------------------------------------------------------------------------
-- generation_jobs — what the GPU worker claims and reports against (PRD §38)
-- ---------------------------------------------------------------------------
create table public.generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  cover_id        uuid not null references public.covers (id) on delete cascade,
  status          public.cover_status not null default 'queued',
  queue_position  integer,
  worker_id       text,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create unique index generation_jobs_cover_idx on public.generation_jobs (cover_id);
create index generation_jobs_queue_idx on public.generation_jobs (created_at) where status = 'queued';

-- ---------------------------------------------------------------------------
-- generation_metrics — one row per generation so unit economics stay measurable (PRD §20)
-- ---------------------------------------------------------------------------
create table public.generation_metrics (
  id                        uuid primary key default gen_random_uuid(),
  cover_id                  uuid not null references public.covers (id) on delete cascade,
  audio_duration_seconds    numeric(10, 2),
  gpu_type                  text,
  gpu_seconds               numeric(10, 2),
  separation_seconds        numeric(10, 2),
  voice_conversion_seconds  numeric(10, 2),
  mixing_seconds            numeric(10, 2),
  peak_vram_mb              numeric(10, 1),
  estimated_gpu_cost_usd    numeric(10, 6),
  created_at                timestamptz not null default now()
);

create index generation_metrics_cover_idx on public.generation_metrics (cover_id);

-- ---------------------------------------------------------------------------
-- payments and credits
-- ---------------------------------------------------------------------------
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.credit_transaction_type as enum ('purchase', 'generation', 'refund', 'bonus');

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  provider             text not null default 'toss',
  provider_payment_id  text,
  amount_krw           integer not null,
  credits              integer not null,
  status               public.payment_status not null default 'pending',
  created_at           timestamptz not null default now()
);

create unique index payments_provider_payment_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create table public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  type          public.credit_transaction_type not null,
  -- Signed: purchases and refunds are positive, generations negative.
  amount        integer not null,
  reference_id  uuid,
  created_at    timestamptz not null default now()
);

create index credit_transactions_user_idx on public.credit_transactions (user_id, created_at desc);
