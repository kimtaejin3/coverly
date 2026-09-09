-- Anti-abuse (PRD §13) needs to count distinct accounts per IP over 24 hours. Storing the IP on
-- the cover keeps that a single query; it is only ever read with the service_role key, and the
-- retention job that clears old covers clears it too.
alter table public.covers add column client_ip text;

create index covers_client_ip_idx on public.covers (client_ip, created_at desc)
  where client_ip is not null;
