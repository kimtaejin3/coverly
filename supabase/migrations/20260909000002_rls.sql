-- Row level security. The service_role key bypasses all of this; the GPU worker and the payment
-- webhook use that key, so no policy below needs to grant them anything.

alter table public.users               enable row level security;
alter table public.voices              enable row level security;
alter table public.covers              enable row level security;
alter table public.generation_jobs     enable row level security;
alter table public.generation_metrics  enable row level security;
alter table public.payments            enable row level security;
alter table public.credit_transactions enable row level security;

-- users ---------------------------------------------------------------------
create policy "read own profile"
  on public.users for select
  using ((select auth.uid()) = id);

create policy "update own profile"
  on public.users for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Credits and the free-generation flag must only move through server-side logic holding the
-- service_role key, so there is deliberately no client-side INSERT policy here.

-- voices --------------------------------------------------------------------
-- The catalogue is the public part of the product; anonymous visitors browse it before signing in.
create policy "anyone reads active voices"
  on public.voices for select
  using (is_active);

-- covers --------------------------------------------------------------------
-- Covers are never public: there is no Explore feed, so a row is visible only to its owner.
create policy "read own covers"
  on public.covers for select
  using ((select auth.uid()) = user_id);

create policy "create own covers"
  on public.covers for insert
  with check ((select auth.uid()) = user_id);

create policy "delete own covers"
  on public.covers for delete
  using ((select auth.uid()) = user_id);

-- Status transitions belong to the worker, not the browser: no client UPDATE policy.

-- generation_jobs -----------------------------------------------------------
-- Read-only for the owner so the create page can poll progress (PRD §38).
create policy "read own jobs"
  on public.generation_jobs for select
  using (
    exists (
      select 1 from public.covers c
      where c.id = generation_jobs.cover_id
        and c.user_id = (select auth.uid())
    )
  );

-- generation_metrics --------------------------------------------------------
-- Cost data is internal; only the service_role key reads it. No policies = no client access.

-- payments and credits ------------------------------------------------------
create policy "read own payments"
  on public.payments for select
  using ((select auth.uid()) = user_id);

create policy "read own credit history"
  on public.credit_transactions for select
  using ((select auth.uid()) = user_id);
