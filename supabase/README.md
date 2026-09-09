# Supabase (Phase 2)

Schema, policies and seed for Coverly. Applied with the Supabase CLI so every change is a file in
this repo rather than a click in a dashboard.

## The project

Linked to `coverly` (`csnybyxnrlvtkvhftqoj`, ap-northeast-2). All four migrations and the seed are
applied. The database password is in `.supabase-db-password` at the repo root — gitignored, and the
only copy, so do not delete it without resetting the password in the dashboard.

```bash
supabase db push --password "$(cat ../.supabase-db-password)"   # after adding a migration
supabase migration new <name>                                    # start one
```

Seeding, or any direct SQL, goes through the pooler — the `db.<ref>` host is IPv6-only on new
projects and will not resolve from most networks:

```bash
PW=$(cat .supabase-db-password)
psql "postgresql://postgres.csnybyxnrlvtkvhftqoj:${PW}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  -f supabase/seed.sql
```

## Migrations

| File | What it does |
|---|---|
| `20260909000001_init.sql` | Tables: users, voices, covers, generation_jobs, generation_metrics, payments, credit_transactions. Trigger that creates a profile row on signup. |
| `20260909000002_rls.sql` | Row level security. Voices are world-readable; everything else is owner-only. Writes that move money or job state have no client policy — they need the service_role key. |
| `20260909000003_credits.sql` | `spend_credit`, `refund_credit`, `grant_credits`. Atomic, and refunds/grants are idempotent so a retried webhook cannot double-credit. |
| `20260909000004_storage.sql` | Buckets `uploads`, `covers` (both private) and `voice-samples` (public), with per-user folder policies. |

## Differences from PRD §32

- **No `cover_likes`, no `visibility`, no `like_count`.** Explore was dropped, so covers are never
  published and there is nothing to like. Each cover is visible only to the user who made it.
- `public.users` extends `auth.users` rather than replacing it.
- `pitch_shift` was added to `covers`: Phase 0 showed that a voice whose range sits far from the
  song's needs transposing, so the value has to survive with the cover.

### Later migrations

| File | What it does |
|---|---|
| `20260909000005_client_ip.sql` | `covers.client_ip`, for the per-IP free-generation cap |
| `20260909000006_source.sql` | `covers.source_type` / `source_url`, so a cover can come from a YouTube link the worker resolves |

## Auth — still to do

Google is **not** enabled yet. In the dashboard, Authentication → Providers → Google, add the OAuth
client id and secret from Google Cloud Console, then add these redirect URLs:

```
http://localhost:3100/auth/callback
https://<production-domain>/auth/callback
```

## Storage retention (PRD §34)

Nothing enforces retention yet. Free previews should drop their source after 7 days and the result
after 30; paid results are kept. Add a scheduled job when Phase 3 lands.
