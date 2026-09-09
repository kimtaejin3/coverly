# Coverly — AI Cover web service (MVP)

Upload a song, pick a voice, get a 30-second AI cover for free; pay per full cover. See `PRD.md`.

## Status

| Phase (PRD §48) | State |
|---|---|
| **0 — AI pipeline PoC + benchmark** (`apps/worker`) | ✅ CLI works end-to-end; measured on Modal L4: 30 s preview in 74.6 s, 3.0 GB VRAM, ~23 KRW; ⏳ 10-song listening test pending |
| **1 — Frontend** (`apps/web`) | ✅ Landing, Voice catalogue, Create flow, Result page |
| **2 — Supabase** (`supabase/`) | ✅ schema, RLS, credit functions, storage buckets. Google and email/password sign-in working; upload and job queue live |
| **3 — GPU worker** (`apps/worker/modal_worker.py`) | ✅ deployed on Modal. Verified end to end: a queued YouTube job produced a finished 30 s cover in 97 s on an L4, 3.0 GB VRAM, $0.022 |
| **4 — Free preview end to end** | ⏳ works for a voice that has a fine-tuned model; the six catalogue voices still need theirs |
| 5–7 — payment, analytics | not started |

Phase 0 findings and cost estimates: `docs/phase0-report.md`.
Implementation plan: `docs/superpowers/plans/2026-09-09-phase0-ai-cover-poc.md`.

## Layout

```
apps/
  web/       Next.js frontend — landing, voice catalogue, create flow, result
  worker/    Python GPU worker — Phase 0 CLI: generate.py, benchmark.py
packages/
  shared/    shared contracts (empty until Phase 2)
docs/        plan + reports
PRD.md
```

## Product decision: no public feed

The PRD's Explore page published user covers. Those covers carry the instrumental separated from a
commercial master, so hosting and publicly transmitting them would infringe the label's neighbouring
rights regardless of whose voice sings. `/voices` shows the voice catalogue instead, with demos
Coverly owns, and users download their own covers and decide themselves whether to share them.
Reasoning and the alternatives considered are in `docs/phase0-report.md`.

## Quick start (Phase 1 — web)

```bash
cd apps/web
pnpm install && pnpm dev   # http://localhost:3100
```

## Quick start (Phase 0 — worker)

```bash
cd apps/worker
uv sync && ./scripts/setup_seedvc.sh && ./scripts/make_fixtures.sh
uv run python generate.py --input samples/synthetic_song.wav --voice voices/demo_voice.wav \
  --start 5 --duration 30 --output output.mp3
```

Details in `apps/worker/README.md`.
