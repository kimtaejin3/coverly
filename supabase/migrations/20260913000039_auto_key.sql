-- 커버를 편한 키로 자동 조정할지, 원래 키 그대로 둘지.
--
-- 지금은 auto_pitch_shift 가 곡의 최고음을 학습 음역 아래로 끌어내려 안 갈라지게
-- 만든다(항상 잘 들림). 그런데 "내 목소리로 부른 것처럼"이 컨셉이라, 내 음역을
-- 넘는 곡은 넘는 대로 들리는 "원래 키" 모드도 필요하다 -- 못 내는 음은 못 내는 대로.
--
-- true(기본)면 예전대로 자동 조정, false 면 pitch_shift=0(원래 키)를 그대로 둔다.

alter table public.covers
  add column auto_key boolean not null default true;

comment on column public.covers.auto_key is
  'true=편한 키로 자동 조정(auto_pitch_shift), false=원래 키 그대로(음역 초과 시 갈라짐).';
