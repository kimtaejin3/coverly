-- Share links. A cover stays owner-only by default; the token is what turns one specific cover
-- into something a link holder can play. It is a random uuid rather than the cover id so a link
-- cannot be guessed from another link, and it can be rotated to revoke access later.
alter table public.covers
  add column share_token uuid not null default gen_random_uuid();

create index covers_share_token_idx on public.covers (share_token);

comment on column public.covers.share_token is
  'Secret half of a share link. Reads by token go through the service_role key, so no row level '
  'security policy grants anonymous access to covers.';
