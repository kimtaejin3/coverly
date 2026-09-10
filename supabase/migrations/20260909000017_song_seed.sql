-- Seed rows for song_ranges.
--
-- The numbers are genre and voice-type typicals, not measurements of these particular records,
-- and every row is marked 'seed' so the first real measurement replaces it. They are here so the
-- recommendation has something to say on day one, not as a claim about any song.
--
-- Deliberately not copied from any compiled list: the ones that exist are CC BY-NC-SA and are
-- databases in their own right (저작권법 제93조).
insert into public.song_ranges (title, artist, genre, f0_low, f0_median, f0_high, source)
values
  ('두 사람', '성시경', '발라드', 150, 215, 300, 'seed'),
  ('보고싶다', '김범수', '발라드', 150, 215, 300, 'seed'),
  ('광화문에서', '규현', '발라드', 150, 215, 300, 'seed'),
  ('야생화', '박효신', '발라드', 150, 215, 300, 'seed'),
  ('너를 위해', '임재범', '발라드', 150, 215, 300, 'seed'),
  ('이 바보야', '정승환', '발라드', 150, 215, 300, 'seed'),
  ('모든 날, 모든 순간', '폴킴', '발라드', 150, 215, 300, 'seed'),
  ('서른 즈음에', '김광석', '발라드', 150, 215, 300, 'seed'),
  ('옛사랑', '이문세', '발라드', 150, 215, 300, 'seed'),
  ('총 맞은 것처럼', '백지영', '발라드', 250, 355, 495, 'seed'),
  ('제발', '이소라', '발라드', 250, 355, 495, 'seed'),
  ('사계', '태연', '발라드', 250, 355, 495, 'seed'),
  ('비도 오고 그래서', '헤이즈', '발라드', 250, 355, 495, 'seed'),
  ('주저하는 연인들을 위해', '잔나비', '모던록', 165, 235, 330, 'seed'),
  ('Antifreeze', '검정치마', '모던록', 165, 235, 330, 'seed'),
  ('난춘', '새소년', '모던록', 260, 370, 510, 'seed'),
  ('Tik Tak Tok', '실리카겔', '모던록', 165, 235, 330, 'seed'),
  ('기억을 걷는 시간', '넬', '모던록', 165, 235, 330, 'seed'),
  ('나는 나비', 'YB', '록', 180, 260, 370, 'seed'),
  ('예뻤어', 'DAY6', '록', 180, 260, 370, 'seed'),
  ('외톨이야', '씨엔블루', '록', 180, 260, 370, 'seed'),
  ('좋은 날', '아이유', '팝', 265, 375, 525, 'seed'),
  ('사건의 지평선', '윤하', '팝', 265, 375, 525, 'seed'),
  ('우주를 줄게', '볼빨간사춘기', '팝', 265, 375, 525, 'seed'),
  ('Love Lee', 'AKMU', '팝', 265, 375, 525, 'seed'),
  ('Ditto', 'NewJeans', '팝', 265, 375, 525, 'seed'),
  ('LOVE DIVE', 'IVE', '팝', 265, 375, 525, 'seed'),
  ('손오공', '세븐틴', '팝', 170, 240, 335, 'seed')
on conflict do nothing;
