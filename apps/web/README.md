# apps/web — Coverly frontend (Phase 1)

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui, on Supabase for auth, data and storage.
Payment and the GPU worker are still missing; everything else runs against the real database.

```bash
pnpm install
pnpm dev        # http://localhost:3100 (3000 is taken by another local app)
```

## Routes

| Route | What it is |
|---|---|
| `/` | The workspace. Controls in a left sidebar, result in the right pane. There is no landing page — the product is the first thing you see |
| `/voices` | Voice catalogue — service-owned demos, the replacement for the PRD's Explore feed |
| `/c/[coverId]` | A single cover: player, download, copy link, upsell. Owner-only, signed URL |
| `/login` | Google, plus email and password |
| `/create` | Redirect to `/`, kept so older links and voice CTAs still work |

`/create?voice=<id>` preselects a voice; every "이 Voice로" button links that way.

## Decisions baked into this build

**No public feed.** The PRD's Explore page published user covers, which would mean hosting and
publicly transmitting the instrumental lifted from a commercial master. `/voices` shows the voices
instead, each with a demo we own. The "이 Voice로 만들어보기" call to action — the part that actually
drives creation — survives intact.

**Download is allowed; publishing is the user's act.** Covers are never posted anywhere by Coverly.
The result page says so, and the footer repeats that responsibility for outside sharing sits with
the user.

**AI labelling.** `AiNotice` is on every page that shows generated audio, per the AI 기본법 in force
since 2026-01-22. The downloadable file needs matching metadata once real files exist.

## Layout

No landing page. `/` is the tool: a sticky left sidebar holds the three controls (upload, section,
voice) and the generate button; the right pane always shows something — an empty state that
explains the product, a summary of what is about to be made, live progress, or the finished cover.
Below `lg` the two collapse into one column, controls first.

The taste-skill audit warns against reflexive left sidebars, but here the controls are a short,
ordered form the user returns to after every generation, so keeping them pinned beats hiding them
behind a menu.

## Source: upload or YouTube

The workspace takes either an uploaded file or a YouTube link. **The web tier never downloads
anything.** A link is parsed and validated (watch, youtu.be, shorts and music.youtube only —
playlists and other hosts are rejected), stored on `covers.source_url`, and the GPU worker is what
resolves it. That keeps retrieval in one place and out of the browser and the API.

Worth knowing before this ships: downloading audio from YouTube is against its terms of service,
and whether it also circumvents a technological protection measure is unsettled — the Yout v. RIAA
appeal argued in February 2024 is the case to watch. Uploads carry none of that. Keep the YouTube
path easy to switch off.

Pasting a link fetches the audio up front through `POST /api/youtube/resolve`, so the user hears
the track and drags the section on a real waveform before generating — identical to an upload from
that point on. The fetched object stays in the private `uploads` bucket and the generate call
reuses it, so nothing is downloaded twice and the section they auditioned is the one converted.
The object path is user input, so it is checked to sit in the caller's own folder.

## API

| Route | What it does |
|---|---|
| `POST /api/covers` | Validates type/size, uploads to the private `uploads` bucket, inserts the cover and a queued job, marks the free generation used. Returns 202 and the cover id — it never waits on inference (PRD §38). |
| `GET /api/covers/:id/status` | Polled every 5 s while generating. Row level security is the authorisation: someone else's cover is simply not found. |

Anti-abuse (PRD §13): one free preview per account, and at most three accounts per IP per 24 hours,
counted from `covers.client_ip`.

## What is still missing

- **The GPU worker.** Jobs land in `generation_jobs` with status `queued` and nothing picks them
  up yet, so a real generation sits at "만들고 있어요" forever. Connecting `apps/worker` is next.
- **Payment.** The full-cover button is disabled; credits, Toss, and the credit spend/refund path
  are Phase 5. The database functions for it already exist.
- **Voice samples.** `voices.sample_url` is empty, so "샘플 듣기" has nothing to play.

## Notes

- `allowedDevOrigins` in `next.config.ts` covers `127.0.0.1` and the LAN IP. Without it the dev
  server blocks those origins, the page renders but never hydrates, and every button is inert.
- Mobile first: the layout targets a 390 px viewport and grows from there.
