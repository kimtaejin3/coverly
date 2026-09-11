-- 지어낸 최저음을 지운다.
--
-- 시드가 음역대별 버킷으로 찍어둔 값들이다 -- (150,215) 31곡, (180,260) 4곡, (265,375) 3곡,
-- (165,235) 1곡. 곡별로 잰 게 아니라 "남성 발라드는 대충 이쯤" 수준의 자리표시였다.
--
-- 이제 57곡에 진짜 최저음이 들어왔다. 진짜와 가짜를 같은 컬럼에 섞어두면, 나중에 최저음
-- 매칭을 켜는 사람이 둘을 구분할 방법이 없다. 값이 없는 것과 틀린 값이 있는 것은 다르고,
-- 없는 쪽이 낫다.

update public.song_ranges
   set f0_low = null
 where (f0_low, f0_median) in ((150,215), (180,260), (265,375), (165,235))
   and source <> 'measured';

-- 앞 마이그레이션이 f0_low/f0_high/f0_peak 만 갱신해서 f0_median 이 0 으로 남았다.
-- /api/songs 의 기본 정렬이 이 컬럼이라 57곡이 목록 맨 앞에 뭉친다.
--
-- 양 끝의 기하평균으로 채운다. 잰 값은 아니지만 0 보다는 곡의 실제 위치에 가깝고,
-- 정렬 말고는 쓰이는 곳이 없다. 누가 그 곡으로 커버를 만들면 실측이 덮어쓴다.
update public.song_ranges
   set f0_median = round(sqrt(f0_low * f0_high)::numeric, 2)
 where f0_median = 0 and f0_low is not null and f0_high is not null;

-- 최저음을 아직 모르는 곡은 그렇다고 말한다.
comment on column public.song_ranges.f0_low is
  '곡의 최저음(Hz). null 이면 아직 모른다 -- 시드가 찍어둔 버킷 추정치는 지웠다.';
