-- The range a personal voice was trained on. train_voice() already measures this to validate the
-- recording and to cut the reference clip; keeping it is what lets us tell the owner where their
-- voice sits and which songs sit near it.
alter table public.voices
  add column f0_low    numeric(7, 2),
  add column f0_median numeric(7, 2),
  add column f0_high   numeric(7, 2);

comment on column public.voices.f0_median is
  'Median f0 of the training recording. Null for catalogue voices.';
