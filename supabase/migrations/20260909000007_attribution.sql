-- CC BY 4.0 requires that credit travels with the work. Storing it on the voice means the
-- attribution is served with the catalogue rather than living only in a file someone has to
-- remember to copy.
alter table public.voices
  add column source_credit text,
  add column source_license text;

comment on column public.voices.source_credit is
  'Human-readable credit line shown wherever the voice appears, when its source requires one.';
