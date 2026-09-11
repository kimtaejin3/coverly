-- Sharing is gone. A cover is readable by the person who made it and nobody else.
--
-- The columns go with it: a share token has no meaning once no code reads it, and leaving a
-- dormant "anyone with this uuid can listen" field in the schema invites someone to wire it back
-- up without thinking about why it was removed.
alter table public.covers
  drop column if exists share_token,
  drop column if exists share_expires_at;
