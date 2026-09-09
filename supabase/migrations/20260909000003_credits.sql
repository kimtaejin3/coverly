-- Credit movements have to be atomic: a generation that debits a credit and then fails must be
-- refundable, and two concurrent requests must never spend the same credit twice (PRD §53).

create function public.spend_credit(p_user_id uuid, p_cover_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  -- The UPDATE ... WHERE credit_balance > 0 takes a row lock, so a concurrent call blocks here
  -- and then sees the decremented balance rather than the stale one.
  update public.users
     set credit_balance = credit_balance - 1
   where id = p_user_id
     and credit_balance > 0
  returning credit_balance into remaining;

  if remaining is null then
    raise exception 'insufficient credits' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'generation', -1, p_cover_id);

  return remaining;
end;
$$;

create function public.refund_credit(p_user_id uuid, p_cover_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  -- A failed paid generation must never cost the user a credit (PRD §39).
  if exists (
    select 1 from public.credit_transactions
     where reference_id = p_cover_id and type = 'refund'
  ) then
    select credit_balance into remaining from public.users where id = p_user_id;
    return remaining;
  end if;

  update public.users
     set credit_balance = credit_balance + 1
   where id = p_user_id
  returning credit_balance into remaining;

  insert into public.credit_transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'refund', 1, p_cover_id);

  return remaining;
end;
$$;

create function public.grant_credits(p_user_id uuid, p_credits integer, p_payment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  -- Payment webhooks retry; granting twice for one payment would be free money.
  if exists (
    select 1 from public.credit_transactions
     where reference_id = p_payment_id and type = 'purchase'
  ) then
    select credit_balance into remaining from public.users where id = p_user_id;
    return remaining;
  end if;

  update public.users
     set credit_balance = credit_balance + p_credits
   where id = p_user_id
  returning credit_balance into remaining;

  insert into public.credit_transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'purchase', p_credits, p_payment_id);

  return remaining;
end;
$$;

-- Only the server (service_role) may move credits.
revoke execute on function public.spend_credit(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.refund_credit(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, uuid) from public, anon, authenticated;
