-- Promo coupons. A code is handed out one conversation at a time -- an Instagram reply, a DM --
-- so the design assumes the person redeeming it is not the person it was given to, eventually:
-- a code leaks, gets posted, and is used by strangers. Hence a redemption cap per code and a
-- hard one-per-account rule rather than trusting the code to stay private.

create table public.coupons (
  code                text primary key,
  grants_generations  smallint not null default 5 check (grants_generations between 1 and 100),
  max_redemptions     integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count      integer not null default 0,
  expires_at          timestamptz,
  note                text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table public.coupon_redemptions (
  code        text not null references public.coupons (code) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- Kept separate from free_generation_limit so a coupon never has to know what the app-wide
-- default is: the limit is the override (or the default) plus whatever coupons have added.
alter table public.users
  add column bonus_generations smallint not null default 0;

comment on column public.users.bonus_generations is
  'Extra free generations from redeemed coupons, added on top of the account limit.';

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- No client policies at all: codes are validated through redeem_coupon() with the service key.
-- Letting a signed-in user read this table would let them enumerate every unused code.

create or replace function public.redeem_coupon(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := upper(trim(p_code));
  v_coupon public.coupons%rowtype;
begin
  -- Lock the row so two redemptions of the last slot cannot both succeed.
  select * into v_coupon from public.coupons where code = v_code for update;

  if not found or not v_coupon.is_active then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if exists (select 1 from public.coupon_redemptions r
             where r.code = v_code and r.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if v_coupon.max_redemptions is not null
     and v_coupon.redeemed_count >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  insert into public.coupon_redemptions (code, user_id) values (v_code, p_user_id);
  update public.coupons set redeemed_count = redeemed_count + 1 where code = v_code;
  update public.users
     set bonus_generations = bonus_generations + v_coupon.grants_generations
   where id = p_user_id;

  return jsonb_build_object('ok', true, 'granted', v_coupon.grants_generations);
end;
$$;

revoke all on function public.redeem_coupon(uuid, text) from public, anon, authenticated;
