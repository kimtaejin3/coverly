-- 음역대는 숫자 하나로 안 끝난다.
--
-- 지금까지 voices.f0_peak 하나로 곡을 매칭했다. 그 값은 "부른 노래의 98 퍼센타일"이라
-- 유저가 편하게 내는 한계도, 쥐어짜서 내는 한계도 아닌 어중간한 지점이었다. 공허해가
-- -2 로 뜨는데 목이 갈라진 게 그래서다.
--
-- 쓰는 곳이 서로 달라서 값을 셋으로 나눈다.
--   f0_comfort_high  편하게 내는 최고음   -> 노래 추천의 "편하게" 경계
--   f0_absolute_high 가성 포함 최고음     -> 노래 추천의 "힘줘야" 경계, 유저에게 보여주는 값
--   f0_train_high    학습 데이터 실측 상한 -> auto_pitch_shift 기준
--
-- 앞의 둘은 사람의 생리, 마지막 하나는 모델의 한계다. 커버에선 사람이 부르지 않으므로
-- 목이 갈라질 일이 없고, 대신 학습에서 못 본 음높이로 가면 음색이 무너진다. 그래서
-- auto_pitch_shift 는 f0_train_high 를 봐야 한다.

alter table public.voices
  add column f0_comfort_high  numeric(7, 2),
  add column f0_absolute_high numeric(7, 2),
  add column f0_train_high    numeric(7, 2),
  -- 스케일 녹음은 노래 녹음과 별도 파일이다. 보관해 두면 재학습 때 다시 부를 필요가 없다.
  add column scale_audio_url  text;

comment on column public.voices.f0_comfort_high is
  '편하게 낼 수 있는 최고음(Hz). 스케일 녹음에서 본인이 "힘들어요"를 누른 지점. 곡 추천의 편안함 경계.';
comment on column public.voices.f0_absolute_high is
  '가성/성대 긴장을 포함한 절대 최고음(Hz). 유저에게 보여주는 값이자 곡 추천의 상한.';
comment on column public.voices.f0_train_high is
  '파인튜닝 데이터가 실제로 커버한 최고음(Hz). auto_pitch_shift 가 보는 값 -- 사람이 아니라 모델의 한계.';
comment on column public.voices.scale_audio_url is
  'uploads 버킷의 스케일 녹음 경로. 없으면 이전 방식대로 노래 녹음만으로 음역을 잡는다.';

-- 기존 목소리는 스케일을 부른 적이 없다. 재학습 전까지는 f0_peak 를 세 값 모두의 근사로 쓴다.
-- 정확하진 않지만 지금 동작과 같고, 컬럼이 전부 null 이면 매칭이 아예 멈춘다.
update public.voices
   set f0_comfort_high  = f0_high,
       f0_absolute_high = f0_peak,
       f0_train_high    = f0_peak
 where f0_peak is not null;
