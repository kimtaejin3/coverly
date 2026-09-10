-- Matching a singer to a song was comparing two different statistics.
--
-- A reference row's f0_high is the song's 최고음 -- its single highest note. A measured row's
-- f0_high is the 90th percentile of the vocal, which is the top of the *comfortable* range and
-- sits far below the peak: measured on real stems, IU's 내 손을 잡아 peaks 2.6 semitones above
-- its 90th percentile and one rock vocal peaks 14 semitones above.
--
-- So a song could read "-2 semitones" while its actual high notes were an octave out of reach,
-- which is what a listener hears as the voice breaking. Peaks are now stored separately and
-- matching uses peak against peak.
alter table public.song_ranges add column f0_peak numeric(7, 2);
alter table public.voices     add column f0_peak numeric(7, 2);

comment on column public.song_ranges.f0_peak is
  'The song''s highest note. For reference rows this is what 최고음 already meant.';
comment on column public.voices.f0_peak is
  'Near the top of what the owner actually sang, as opposed to their comfortable ceiling.';

-- A reference row's f0_high was always the peak; nothing to recompute.
update public.song_ranges set f0_peak = f0_high where source = 'reference';
