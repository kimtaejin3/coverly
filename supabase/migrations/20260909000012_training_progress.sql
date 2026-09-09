-- Training runs for about twenty minutes. Without a progress signal the owner watches a spinner
-- and cannot tell a slow run from a dead one.
alter table public.voices
  add column training_progress smallint not null default 0,
  add column training_stage text;

comment on column public.voices.training_progress is
  'Percent complete, written by the worker as the fine-tune advances.';
