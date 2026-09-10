-- Vocal ranges for songs, so we can point someone at the ones that sit near their own voice.
--
-- Built by measuring, not by copying. The compiled lists that exist (나무위키 등) are CC BY-NC-SA
-- and a database in their own right under 저작권법 제93조, so lifting one into a commercial
-- service is wrong twice over. Every cover already separates the vocal and measures its f0, so
-- the numbers here accumulate from our own pipeline; the seed rows are estimates that the first
-- real measurement replaces.
create table public.song_ranges (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  artist         text not null,
  genre          text,
  -- Percentiles of the separated vocal's f0, in Hz. The median is what matching keys off.
  f0_low         numeric(7, 2),
  f0_median      numeric(7, 2) not null,
  f0_high        numeric(7, 2),
  -- 'seed' until the pipeline has measured it, then 'measured'.
  source         text not null default 'seed' check (source in ('seed', 'measured')),
  measured_count integer not null default 0,
  updated_at     timestamptz not null default now()
);

create unique index song_ranges_title_artist_idx
  on public.song_ranges (lower(title), lower(artist));
create index song_ranges_median_idx on public.song_ranges (f0_median);

alter table public.song_ranges enable row level security;

create policy "anyone reads song ranges"
  on public.song_ranges for select using (true);

-- The measured vocal range of the source, kept beside the cost numbers it sits next to.
alter table public.generation_metrics
  add column source_f0_low    numeric(7, 2),
  add column source_f0_median numeric(7, 2),
  add column source_f0_high   numeric(7, 2),
  add column pitch_shift      smallint;

comment on column public.generation_metrics.source_f0_median is
  'Median f0 of the separated source vocal. Feeds song_ranges.';
