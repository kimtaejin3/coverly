# coverly-worker — Phase 0 PoC

Command-line AI cover generation: `song + 30-second section + reference voice → cover.mp3`,
plus a benchmark that measures per-stage time, GPU, VRAM and estimated cost (PRD §54).

```
Original audio ─ffmpeg trim─▶ trimmed.wav ─Demucs─▶ vocals.wav + no_vocals.wav
                                                        │
                                              Seed-VC (f0-conditioned, 44.1 kHz)
                                                        │
                                                 converted.wav ─ffmpeg mix─▶ cover.mp3
```

Everything heavy runs as a subprocess (ffmpeg, `python -m demucs`, Seed-VC `inference.py` in
its own venv). The pipeline only moves files and keeps time.

## Prerequisites

- `ffmpeg` / `ffprobe` on PATH (`brew install ffmpeg`)
- [`uv`](https://docs.astral.sh/uv/) (installs Python 3.12 / 3.11 on demand)
- ~6 GB free disk (two torch installs + ~3 GB Seed-VC checkpoints)
- GPU optional. Apple Silicon uses MPS; NVIDIA uses CUDA; otherwise CPU (slow but works).

## Install

```bash
cd apps/worker
uv sync                      # worker venv: demucs 4.1, torch, numpy
./scripts/setup_seedvc.sh    # clones Seed-VC into vendor/seed-vc and builds its own py3.11 venv
./scripts/make_fixtures.sh   # optional (macOS): rights-free synthetic song + demo voice
```

Seed-VC downloads its checkpoints (~3 GB: DiT, Whisper-small, BigVGAN, CAMPPlus, RMVPE) on the
first `generate.py` run into `vendor/seed-vc/checkpoints/`. Demucs downloads `htdemucs` (~80 MB)
into `~/.cache/torch/hub`.

## Generate one cover

```bash
uv run python generate.py \
  --input ./samples/song.mp3 \
  --voice ./voices/sample.wav \
  --start 60 \
  --duration 30 \
  --output ./output.mp3
```

Prints the PRD §54 report:

```
Generation completed

Audio: 30.0 sec
GPU: NVIDIA L4

Trim: 0.8 sec
Separation: 8.1 sec
Voice Conversion: 19.4 sec
Mix: 1.2 sec

Total: 29.5 sec
Realtime factor: 0.98x
Peak VRAM: 5120 MB
```

Useful flags:

| flag | meaning |
|---|---|
| `--duration 0` | full song (Phase 5 "Full Cover") |
| `--pitch-shift N` | semitones applied to the converted vocal |
| `--diffusion-steps N` | Seed-VC quality/speed knob (30 default, 50 = better/slower) |
| `--device auto\|cuda\|mps\|cpu` | force a device (`auto` picks cuda → mps → cpu) |
| `--keep-work` / `--work-dir DIR` | keep `trimmed.wav`, stems and converted vocal for listening |
| `--metrics-json PATH` | write the metrics as JSON (same shape as the future `generation_metrics` row) |
| `--provider passthrough` / `--separator copy` | run the plumbing without models |

`--voice` accepts a file path or a name resolved as `voices/<name>.wav`. See `voices/README.md`.

## Benchmark (PRD §48 10-sample test)

```bash
uv run python benchmark.py \
  --inputs samples/*.mp3 \
  --voice voices/sample.wav \
  --start 30 --duration 30 \
  --out-dir bench_out --gpu L4 --usd-krw 1400
```

Writes to `bench_out/`:

- one `cover` mp3 per input (listen to these for the ≥7/10 acceptance check)
- `results.json` — every run's metrics + summary (mean/median/min/max per stage) + cost
- `results.csv` — one row per run
- `review_template.csv` — fill in `usable` (y/n) and `notes` per output

The cost line multiplies mean total wall-clock seconds by the Modal on-demand price of `--gpu`
(table in `coverly_worker/metrics.py`, checked 2026-09-09). Override with `--gpu-price-usd-per-sec`.

## Cloud GPU benchmark (Modal, unverified)

`modal_benchmark.py` runs the identical pipeline on a Modal GPU and warms all model weights into
the image. It has **not** been executed in this repo yet (needs a Modal account):

```bash
uv pip install modal && uv run modal setup
COVERLY_GPU=L4 uv run modal run modal_benchmark.py --inputs samples/a.mp3,samples/b.mp3 --voice voices/x.wav
```

## Where the catalogue voices come from

All six ship from [VocalSet](https://zenodo.org/records/1193957) — 10.1 hours of professional
singers, released under **CC BY 4.0**. That licence is the reason it was chosen: most singing
datasets (CSD among them) carry a NonCommercial clause and cannot be used in a paid product, and
the difference is easy to miss because the datasets otherwise look interchangeable. Check the
licence of anything you add, and prefer CC BY or a signed contract.

```bash
python scripts/prepare_vocalset.py --root datasets/_raw/FULL --list
python scripts/prepare_vocalset.py --root datasets/_raw/FULL --singer female1 --name aria
```

The script keeps sustained singing (long tones, scales, arpeggios, vibrato) and drops the extended
techniques (vocal fry, lip trills, breathy, spoken) — deliberate strange noises that would pull a
voice model somewhere the product never goes. It writes `voices/<name>.ATTRIBUTION.txt` beside
every voice, and `voices.source_credit` renders the same credit on the Voice page, because CC BY
requires the credit to travel with the work.

Attribution aside, a licence is not a release of the singer's own voice rights. VocalSet's session
singers are unnamed, which keeps that risk low, not zero.

## Preparing a voice

A reference clip decides most of the output quality. `make_voice.py` isolates a vocal from any song,
picks a window that is actually sung, and can match the pitch range of the song you plan to cover —
a reference an octave above the target teaches the model nothing about the register the song lives in.

```bash
uv run python make_voice.py --input singer.mp3 --name jisoo \
  --match ./samples/target_song.mp3 \   # pick a window in the target's vocal range
  --dataset                             # also write fine-tuning clips to datasets/jisoo/
```

Fine-tune that voice so the model learns its whole range rather than copying one 22 s snapshot:

```bash
./scripts/finetune_local.sh jisoo 1000                      # local (MPS/CUDA)
COVERLY_GPU=L4 uv run modal run modal_finetune.py \
  --voice-name jisoo --sections work/sections/clip.mp3      # on a cloud GPU, then A/B vs zero-shot
```

`generate.py` uses the stock model; pass a fine-tuned checkpoint through `SeedVCProvider(checkpoint=, config=)`.

## Running as the service worker (Phase 3)

`modal_worker.py` is the deployed worker. It drains `generation_jobs` and writes finished covers
back to Supabase.

```bash
uv run modal secret create coverly-supabase \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKER_SHARED_SECRET=...
uv run modal deploy modal_worker.py
```

Two ways a job starts, on purpose:

- **`enqueue`** — a web endpoint the Next.js API calls the moment it creates a job, so nobody
  waits for a poll interval. Shared-secret authenticated; without that, anyone could make us run
  GPU work on arbitrary ids.
- **`sweep`** — runs every two minutes and claims anything still queued. A lost HTTP call or a
  container that dies mid-job then costs a couple of minutes instead of stranding the work.

Claiming is a conditional update on `status = queued`, so two workers can never take the same job.
Any failure marks the job failed and refunds a paid credit before re-raising (PRD §39).

### Voice models

`voices.model_reference` names a directory in the `coverly-voice-models` volume holding
`ft_model.pth` and `config.yml`; the matching reference clip lives at `_voices/<voice_id>.wav`.
A voice without a checkpoint falls back to zero-shot, which Phase 0 showed is markedly worse
outside the reference's pitch range.

### Sources

`source_type = upload` downloads from the private `uploads` bucket. `source_type = youtube` runs
`yt-dlp` here — the only place in the system that fetches from YouTube, so it is also the only
place to change if that path is switched off.

## Architecture / swapping models

- `coverly_worker/separation.py` — `Separator` protocol; `DemucsSeparator`, `CopySeparator`
- `coverly_worker/voice_conversion.py` — `VoiceConversionProvider` protocol; `SeedVCProvider`,
  `PassthroughProvider`. Adding RVC = one more class with `convert(vocal_path, voice_id, work_dir, pitch_shift) -> Path`.
- `coverly_worker/seedvc_shim.py` — standalone launcher run by the Seed-VC venv (device override + MPS float64 shim)
- `coverly_worker/pipeline.py` — `run_generation(request, separator, provider)`; never imports a model.
- `coverly_worker/metrics.py` — `GenerationMetrics`, `estimate_cost`, GPU price table
- `coverly_worker/device.py` — device detection, `VramSampler` (nvidia-smi polling; `None` on Mac)

## Troubleshooting

- **Seed-VC on Apple Silicon**: `inference.py` is launched through `coverly_worker/seedvc_shim.py`,
  which makes the device explicit (`SEEDVC_DEVICE`, set from `--device`) and casts RMVPE's float64
  f0 to float32 on MPS (MPS has no float64; upstream only tests CUDA/CPU). If MPS still trips on an
  op, run with `--device cpu` — the shim hides CUDA/MPS so Seed-VC falls back to CPU.
- **`voice '<x>' not found`**: pass a path or put `voices/<x>.wav` in place.
- **First run is slow**: checkpoint downloads. Timings in the report exclude nothing — re-run for
  warm numbers (`benchmark.py --repeat 2`).
- Intermediates are deleted after success unless `--keep-work`; failures leave the temp dir for inspection only when `--work-dir` is given.
