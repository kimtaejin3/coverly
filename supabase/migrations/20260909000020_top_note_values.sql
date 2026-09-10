-- Verified 최고음 values. Chest voice (진성) where a song has a separate falsetto peak, since
-- that is what the singer has to actually reach.
update public.song_ranges set top_note = v.note, f0_high = v.hz, source = 'reference'
from (values
  ('야생화',                  '박효신',   '3옥타브 도',   523.25),
  ('좋은 날',                 '아이유',   '3옥타브 파#',  739.99),
  ('사건의 지평선',            '윤하',     '3옥타브 레',   587.33),
  ('예뻤어',                  'DAY6',    '2옥타브 라#',  466.16),
  ('서른 즈음에',              '김광석',   '2옥타브 솔#',  415.30),
  ('주저하는 연인들을 위해',    '잔나비',   '2옥타브 솔',   392.00)
) as v(title, artist, note, hz)
where song_ranges.title = v.title and song_ranges.artist = v.artist;
