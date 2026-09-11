-- 같은 곡이 두 줄이 됐다.
--
-- 앞 마이그레이션이 조사 자료의 영문 아티스트명(BTS, SEVENTEEN, Westlife, LE SSERAFIM)으로
-- 행을 넣었는데, 카탈로그에는 같은 곡이 한글명(방탄소년단, 세븐틴, 웨스트라이프, 르세라핌)으로
-- 이미 있었다. (title, artist) 로 매칭했으니 충돌이 안 잡혔다.
--
-- 예전 NFC 자소분리로 DAY6 곡이 두 줄이 됐던 것과 같은 종류다. 그때는 글자 코드가 달랐고
-- 이번엔 표기가 다르다. 어느 쪽이든 "제목과 가수가 같으면 같은 곡"이라는 전제가 표기 하나에
-- 기대고 있다는 뜻이다.
--
-- 값은 새 행에, 이름은 기존 행에 있다. 카탈로그 표기를 살리고 값만 옮긴다.
-- 붉은 노을(이문세/빅뱅)과 첫사랑(버스커 버스커/aespa)은 진짜 다른 곡이라 건드리지 않는다.

update public.song_ranges old
   set f0_low = new.f0_low, f0_median = new.f0_median, f0_high = new.f0_high,
       f0_peak = new.f0_peak, top_note = new.top_note, source = new.source
  from public.song_ranges new
 where old.title = new.title
   and (old.artist, new.artist) in (
     ('방탄소년단', 'BTS'), ('세븐틴', 'SEVENTEEN'),
     ('웨스트라이프', 'Westlife'), ('르세라핌', 'LE SSERAFIM'))
   and old.f0_peak is null;

delete from public.song_ranges
 where (title, artist) in (
   ('Dynamite', 'BTS'), ('손오공', 'SEVENTEEN'),
   ('You Raise Me Up', 'Westlife'), ('ANTIFRAGILE', 'LE SSERAFIM'));
