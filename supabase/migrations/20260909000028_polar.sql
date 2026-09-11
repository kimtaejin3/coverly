-- Polar is a Merchant of Record and settles in USD, so the payment amount is not KRW. Recording
-- it in amount_krw would have been a quietly wrong number in every report built on this table.
alter table public.payments
  add column amount_cents integer,
  add column currency     text;

comment on column public.payments.amount_cents is
  'What the customer paid, in the smallest unit of `currency`. amount_krw stays for local PGs.';

alter table public.payments alter column amount_krw drop not null;

-- Counts training runs so the first one can stay free while the rest cost a credit.
alter table public.voices
  add column train_count smallint not null default 0;

update public.voices set train_count = 1 where status in ('ready', 'failed', 'training');
