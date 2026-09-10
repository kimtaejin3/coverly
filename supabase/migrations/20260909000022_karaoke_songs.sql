-- Songs taken from a karaoke popularity chart rather than from my own guesses about what
-- people sing. Trot and the pre-90s standards on that chart are left out; this is the slice a
-- 20-40 year old queues up. Ranges start empty and get filled by research or by measurement.
insert into public.song_ranges (title, artist, genre, f0_median, source)
values
  ('모르시나요', '조째즈', '발라드', 0, 'seed'),
  ('나는 반딧불', '황가람', '발라드', 0, 'seed'),
  ('가시', '버즈', '록', 0, 'seed'),
  ('예술이야', 'PSY', '팝', 0, 'seed'),
  ('Tears', '소찬휘', '록', 0, 'seed'),
  ('가질 수 없는 너', '뱅크', '발라드', 0, 'seed'),
  ('친구', '안재욱', '발라드', 0, 'seed'),
  ('행복하지 말아요', 'M.C THE MAX', '발라드', 0, 'seed'),
  ('이미 슬픈 사랑', '야다', '록', 0, 'seed'),
  ('천상연', '이창섭', '발라드', 0, 'seed'),
  ('Drowning', 'WOODZ', '팝', 0, 'seed'),
  ('술 한잔해요', '지아', '발라드', 0, 'seed'),
  ('응급실', 'izi', '발라드', 0, 'seed'),
  ('삭제', '이승기', '발라드', 0, 'seed'),
  ('준비 없는 이별', '녹색지대', '발라드', 0, 'seed'),
  ('슬퍼지려 하기전에', '쿨', '팝', 0, 'seed'),
  ('비와 당신', '럼블피쉬', '발라드', 0, 'seed'),
  ('형', '노라조', '록', 0, 'seed'),
  ('애상', '쿨', '팝', 0, 'seed'),
  ('I Love You', '포지션', '발라드', 0, 'seed'),
  ('남자를 몰라', '버즈', '록', 0, 'seed'),
  ('심', 'DK', '발라드', 0, 'seed'),
  ('My Love', '버즈', '록', 0, 'seed'),
  ('말리꽃', '이승철', '발라드', 0, 'seed'),
  ('어디에도', 'M.C THE MAX', '발라드', 0, 'seed'),
  ('좋니', '윤종신', '발라드', 0, 'seed'),
  ('애인 있어요', '이은미', '발라드', 0, 'seed'),
  ('서울의 달', '김건모', '발라드', 0, 'seed'),
  ('붉은 노을', '빅뱅', '팝', 0, 'seed'),
  ('희나리', '구창모', '발라드', 0, 'seed')
on conflict do nothing;
