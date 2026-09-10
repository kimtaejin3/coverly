-- Song titles arrive as filenames, and a filename from macOS is NFD: "거미" is stored as four
-- code points, not two. An NFC literal then fails to match it, and the same song accumulates a
-- second row -- which is exactly what happened to DAY6's 한 페이지가 될 수 있게, once as a seed
-- and once as a measurement.
--
-- Merge the decomposed rows into their composed twins, keeping whichever side was measured, then
-- normalise what is left.
with decomposed as (
  select id, normalize(title, NFC) as t, normalize(artist, NFC) as a,
         f0_low, f0_median, f0_high, top_note, source, measured_count
  from public.song_ranges
  where title <> normalize(title, NFC) or artist <> normalize(artist, NFC)
),
merged as (
  update public.song_ranges s
     set f0_low = d.f0_low, f0_median = d.f0_median, f0_high = d.f0_high,
         top_note = coalesce(s.top_note, d.top_note),
         source = case when d.source = 'measured' then 'measured' else s.source end,
         measured_count = greatest(s.measured_count, d.measured_count)
    from decomposed d
   where lower(s.title) = lower(d.t) and lower(s.artist) = lower(d.a) and s.id <> d.id
  returning d.id as dupe_id
)
delete from public.song_ranges where id in (select dupe_id from merged);

update public.song_ranges
   set title = normalize(title, NFC), artist = normalize(artist, NFC)
 where title <> normalize(title, NFC) or artist <> normalize(artist, NFC);
