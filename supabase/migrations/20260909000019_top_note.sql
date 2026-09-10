-- 최고음 as the thing the table is actually about.
--
-- Correcting an earlier over-reach: a song's highest note is a fact, and facts are not
-- copyrightable (저작권법 제2조제1호 protects 표현, not 사실). 제93조 covers copying "전부 또는
-- 상당한 부분" of a database, which looking up individual values is not. So verified values go in
-- here as facts, cited to nothing because facts need no citation; what is still avoided is
-- lifting somebody's whole compiled list or their prose.
alter table public.song_ranges
  add column top_note text;

comment on column public.song_ranges.top_note is
  '최고음 in Korean octave notation, e.g. "3옥타브 도". Null until known.';

-- 'reference' = a published value; 'seed' = a genre typical standing in until better is known.
alter table public.song_ranges drop constraint song_ranges_source_check;
alter table public.song_ranges
  add constraint song_ranges_source_check
  check (source in ('seed', 'reference', 'measured'));
