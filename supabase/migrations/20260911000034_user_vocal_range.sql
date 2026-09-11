-- 음역대는 목소리가 아니라 사람의 속성이다.
--
-- 지금까지 voices 에만 붙어 있었다. 그래서 음역대를 재려면 목소리 학습을 시작해야 했고,
-- 목소리를 두 개 만들면 같은 목의 같은 음역이 두 번 저장됐다.
--
-- 사람 쪽으로 옮긴다. 다만 voices.f0_train_high 는 그대로 둔다 -- 그건 목의 사실이 아니라
-- 그 체크포인트가 무엇을 봤는지에 대한 사실이라 목소리마다 다르다.

alter table public.users
  add column f0_comfort_high  numeric(7, 2),
  add column f0_modal_high    numeric(7, 2),
  add column f0_falsetto_high numeric(7, 2),
  add column range_measured_at timestamptz;

comment on column public.users.f0_comfort_high is
  '편하게 내는 최고음(Hz). 스케일에서 본인이 표시한 지점.';
comment on column public.users.f0_modal_high is
  '진성 최고음(Hz). 곡 매칭 기준 -- 곡 최고음이 거의 전부 진성이라서.';
comment on column public.users.f0_falsetto_high is
  '가성 최고음(Hz). 표시용.';
comment on column public.users.range_measured_at is
  '마지막 측정 시각. 다시 재면 덮어쓴다 -- 음역은 변하고, 최신값이 맞는 값이다.';

-- 이미 목소리를 만들면서 잰 사람은 그 값을 사람 쪽으로 올려둔다. 여러 개면 가장 최근 것.
update public.users u
   set f0_comfort_high  = v.f0_comfort_high,
       f0_modal_high    = v.f0_modal_high,
       f0_falsetto_high = v.f0_falsetto_high,
       range_measured_at = v.created_at
  from (
    select distinct on (owner_user_id)
           owner_user_id, f0_comfort_high, f0_modal_high, f0_falsetto_high, created_at
      from public.voices
     where owner_user_id is not null and f0_modal_high is not null
     order by owner_user_id, created_at desc
  ) v
 where v.owner_user_id = u.id;

-- 본인 음역대만 쓰고 읽는다.
create or replace function public.save_vocal_range(
  p_comfort numeric, p_modal numeric, p_falsetto numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  -- 사람 목소리가 낼 수 있는 범위 밖의 값은 받지 않는다.
  if p_modal is null or p_modal < 70 or p_modal > 1200 then
    raise exception 'modal high out of range';
  end if;
  update public.users
     set f0_comfort_high  = least(greatest(coalesce(p_comfort, p_modal), 70), 1200),
         f0_modal_high    = p_modal,
         f0_falsetto_high = case
           when p_falsetto is null or p_falsetto <= p_modal then null
           else least(p_falsetto, 1200) end,
         range_measured_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.save_vocal_range(numeric, numeric, numeric) to authenticated;
