-- A cover can now come from a YouTube link instead of an upload. The web app never downloads
-- anything: it stores the URL and the GPU worker fetches the audio, so the browser and the API
-- stay out of the retrieval path entirely.
create type public.cover_source as enum ('upload', 'youtube');

alter table public.covers
  add column source_type public.cover_source not null default 'upload',
  add column source_url text;

comment on column public.covers.source_url is
  'For source_type = youtube: the watch URL the worker resolves. Null for uploads.';
