-- 임재범 '어찌합니까'. 후렴에 최고음 2옥타브 라#(A#4)이 두 번 나온다.
insert into public.song_ranges (title, artist, genre, f0_median, f0_high, top_note, source)
values ('어찌합니까', '임재범', '발라드', 0, 466.16, '2옥타브 라#', 'reference')
on conflict do nothing;
