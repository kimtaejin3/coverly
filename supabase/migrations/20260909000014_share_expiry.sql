-- Share links are served by the service key, so an unexpiring link means this service keeps
-- transmitting the audio to anyone who ever received the URL, indefinitely. Copyright liability
-- for that transmission sits with the operator, not the person who pasted the link, so the
-- exposure has to end on its own.
alter table public.covers
  add column share_expires_at timestamptz not null default (now() + interval '30 days');

comment on column public.covers.share_expires_at is
  'After this the share token stops working. The owner still reads the cover through RLS.';

-- Existing covers get the same 30 days from now rather than from when they were made.
update public.covers set share_expires_at = now() + interval '30 days';
