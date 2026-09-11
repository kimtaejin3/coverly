-- 진성과 가성은 다른 천장이다.
--
-- 곡 DB 의 최고음은 확인된 78곡 중 77곡이 진성 기준이다(나머지 하나만 '(가성)'으로 표기).
-- 그런데 우리가 비교하던 f0_absolute_high 에는 가성이 섞여 있었다. 가성으로 3옥타브 도에
-- 닿는 사람에게 진성으로는 못 부를 곡을 "부를 수 있다"고 말하게 된다.
--
-- 판정에 써야 하는 건 진성 상한이다. 가성 상한은 보여주는 값이다 -- 노래방에서 후렴을
-- 가성으로 넘기는 건 실제로 쓰는 방법이라 알려줄 가치가 있지만, 곡이 요구하는 음과
-- 같은 종류의 숫자가 아니다.
--
-- 판별은 H1-H2(기음과 2배음의 dB 차)로 한다. 가성은 성문 파형이 정현파에 가까워 배음이
-- 죽고 H1 이 커진다. 합성 모음으로 확인한 값은 진성 +1.8dB, 가성 +13.5dB 로 깨끗하게
-- 갈렸다. 절대 임계값 대신 한 스케일 안에서 전환점을 찾는다 -- 마이크와 목소리마다
-- 기준선이 다르기 때문이다.

alter table public.voices
  add column f0_modal_high    numeric(7, 2),
  add column f0_falsetto_high numeric(7, 2);

comment on column public.voices.f0_modal_high is
  '진성으로 낸 가장 높은 음(Hz). 곡 매칭이 보는 값 -- 곡 최고음이 거의 전부 진성 기준이라서.';
comment on column public.voices.f0_falsetto_high is
  '가성으로 낸 가장 높은 음(Hz). 없으면 가성 구간을 안 썼다는 뜻. 표시용이지 매칭 기준이 아니다.';

-- 스케일을 부르기 전에 만든 목소리는 진성/가성 구분이 없다. 기존 동작과 같도록
-- 절대 상한을 진성 상한의 근사로 쓴다. 재학습하면 실제로 갈린 값이 들어온다.
update public.voices
   set f0_modal_high = f0_absolute_high
 where f0_absolute_high is not null;
