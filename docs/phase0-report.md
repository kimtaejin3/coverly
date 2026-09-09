# Phase 0 Report — AI Cover pipeline PoC

Date: 2026-09-09 · Machine: Apple M3, 16 GB, macOS 26.5 (no NVIDIA GPU) · Code: `apps/worker`

## What works

- End-to-end CLI `generate.py`: `trim (ffmpeg) → Demucs htdemucs (2 stems) → Seed-VC v1 f0-conditioned 44.1 kHz → ffmpeg mix → mp3`, exactly the PRD §15 pipeline, trimming **before** separation (§16).
- Per-generation metrics in the PRD §54 format + JSON (`--metrics-json`): audio duration, trim / separation / voice-conversion / mix / total seconds, device, GPU name, peak VRAM (nvidia-smi sampling; `None` on Mac).
- `benchmark.py`: N songs × R repeats → `results.json/csv`, per-stage mean/median/min/max, success rate, cost estimate per generation for a chosen GPU, and a `review_template.csv` for the 7/10 listening test.
- Model isolation: Demucs and Seed-VC each run as a subprocess behind a Protocol (`Separator`, `VoiceConversionProvider`); Seed-VC lives in its own py3.11 venv with an inference-only pinned dependency set (`scripts/seedvc-requirements.txt`), so RVC or a hosted API can be dropped in without touching the pipeline.
- Rights-free smoke fixtures (`scripts/make_fixtures.sh`): macOS `say` speech over a synthetic chord bed + a second `say` voice as the reference.

## Measured locally (Apple M3, MPS/CPU — NOT the production target)

First full run (`generate.py`, synthetic 90 s song, 30 s section from 5 s, `voices/demo_voice.wav`, 30 diffusion steps, `--device auto` → MPS):

```
Generation completed

Audio: 30.0 sec
GPU: Apple M3 (MPS)

Trim: 0.1 sec
Separation: 4.7 sec
Voice Conversion: 105.3 sec
Mix: 0.4 sec

Total: 110.4 sec
Realtime factor: 3.68x
```

Breakdown of the 105 s voice-conversion stage (from Seed-VC's own log): ≈ 11 s process start + model
load, ≈ 99 s inference (Seed-VC RTF 3.29 on MPS; the 30 s source is processed as two ≈15 s chunks of
30 diffusion steps at ≈1.65 s/step, plus Whisper, RMVPE f0 and BigVGAN vocoding). Peak VRAM: not
measurable on Apple Silicon (`None`); process RSS peaked ≈ 8 GB.

Sanity checks on the artefacts (no human listening yet — synthetic speech input):
- Output `first_cover.mp3`: 30.0 s, 44.1 kHz stereo; converted vocal 29.99 s mono 44.1 kHz.
- Levels: source vocal stem mean −19.2 dB / peak −4.8 dB → converted vocal mean −14.2 dB / peak **0.0 dB**
  (Seed-VC/BigVGAN output is hot) → final mix mean −17.4 dB / peak −3.0 dB after the limiter.
  Expect to lower `vocal_gain_db` (≈ −4 dB) in `audio.mix()` once real songs are auditioned.
- Demucs `htdemucs` on MPS: 4.7 s for 30 s (≈ 0.16 RTF) — separation is not the bottleneck anywhere.

Bugs found and fixed during the run:
- Seed-VC on MPS crashed at `inference.py:329` (`torch.from_numpy(F0_ori).to(device)`, float64 from
  RMVPE; MPS has no float64). Fixed without touching the vendor checkout: `coverly_worker/seedvc_shim.py`
  launches `inference.py` with an explicit `SEEDVC_DEVICE` and casts float64 → float32 on MPS.
- demucs 4.1.0 declares numpy/torch pins only for darwin-x86_64; on arm64 `uv` resolved torch 2.2.2
  with no numpy. `pyproject.toml` now pins `numpy>=1.26`, `torch>=2.5` and limits `tool.uv.environments`.

`benchmark.py` verified with the real models on the same sample (`bench_out/local-mps/`):
total 106.7 s (sep 4.6 s, vc 101.8 s), success 1/1. Its cost line — "if this exact Mac wall-clock were
billed at L4 price" — is **33 KRW**, i.e. even the pessimistic bound is under the PRD's 40 KRW
"very good" line; a real L4 should be several times faster.

What this tells us about production (CUDA):
- The subprocess design pays model load (~11 s here, more on a cold container) on **every** call.
  Phase 3 worker must keep Seed-VC resident (long-lived process or in-process import) — this alone is
  worth more than any GPU choice.
- Seed-VC inference is ~90 % of the time. Its published RTF on a laptop RTX 3060 is ≈ 0.3–0.5 for
  singing, i.e. ≈ 10–15 s for 30 s of audio; an L4 is in the same class or faster.

### Measured on a real cloud GPU (NVIDIA L4, Modal) — 2026-09-09

Real K-pop track (BSS, 3:34 mp3), 30 s section from 0:30, female reference voice, 30 diffusion steps:

| stage | seconds |
|---|---|
| Trim | 0.2 |
| Separation (Demucs htdemucs) | 12.3 |
| Voice Conversion (Seed-VC) | 61.2 |
| Mix | 1.0 |
| **Total (warm, in-container)** | **74.6** |
| Round-trip incl. cold start | 87.2 |
| **Peak VRAM** | **3,014 MB** |

Cost at Modal L4 pricing: **23 KRW per 30-second preview** (74.6 s x 0.000222 USD/s x 1,400 KRW/USD),
under the PRD's 40 KRW "very good" threshold. VRAM of 3.0 GB means a **T4 (16 GB) is plenty** —
at T4 pricing the same job is ~17 KRW if the slower GPU does not stretch the runtime much.

Surprises vs. the local Mac run: Demucs is *slower* on L4 (12.3 s) than on M3/MPS (5.1 s) because the
first call includes weight load, while Seed-VC is ~1.7x faster (61.2 s vs 108 s). Seed-VC still
dominates at 82% of the total, and ~11 s of it is process start + model load paid on every call —
Phase 3 must keep the model resident.

Container-side fix needed: `transformers 4.46` pulls an old protobuf whose enum wrappers lack
`.ValueType`, which crashes Modal's injected client at import. `modal_benchmark.py` now pins
`protobuf>=5.27,<7` in the image.

### Quality findings from real-song listening tests (2026-09-09)

Ten clips from one K-pop track (BSS, five 30 s sections x two voices) all generated successfully,
but the owner judged the voice unusable: "sounds like an awkward elementary school boy, not a
woman", later refined to "only the high notes resemble the target, the normal range is completely
wrong". Measuring pitch turned that into a concrete diagnosis.

| track | 10th pct | median | 90th pct |
|---|---|---|---|
| BSS source vocal (what we convert) | 200 Hz (G3) | 266 Hz (C4) | 328 Hz (E4) |
| IU reference, chorus window | 413 Hz | 517 Hz (C5) | 644 Hz |
| IU reference, verse window | 287 Hz | 415 Hz | 590 Hz |

Two facts follow, and both are product-shaping:

1. **Seed-VC preserves source pitch exactly.** Converted vocal measured 271 Hz against a 266 Hz
   source. Timbre moves, pitch does not. A male-pitched melody with female formants is precisely the
   "boy" sound; only where the source climbs above E4 does it overlap the reference and improve.
2. **A reference only teaches the pitches it contains.** The reference never went below 287 Hz while
   most of the source sits under 266 Hz, so the model had no example of that voice in the register
   where the song actually lives.

Mitigations built and measured:
- `make_voice.py` isolates a vocal from any song and picks a reference window by singing density,
  and with `--match <song>` by pitch range too (it measured BSS at 262 Hz and picked an IU window at
  285 Hz instead of the 517 Hz chorus).
- Two strategies were generated for A/B: matched-range reference at original key, versus keeping the
  high reference and transposing the source up an octave (an octave is the only shift that stays
  consonant with the untransposed instrumental).
- Diffusion steps raised 30 -> 50, the ceiling Seed-VC recommends for singing.

Remaining structural limit: a 22-25 s reference cannot cover a singer's full range, which is what
fine-tuning (minimum 1 utterance, ~100 steps) or a per-voice trained model (RVC) exists to fix.
Since the MVP ships 3-10 fixed voices and explicitly excludes a voice-training UI, a trained
per-voice model is the right architecture either way; zero-shot's only advantage, instant arbitrary
voices, is not a requirement at MVP.

### Modal operational notes

- Free credits and the workspace **spend limit are separate controls**. Usage was fully covered by
  credits (metered $1.29, billed $0.00) yet new jobs were still refused with "workspace has exceeded
  its spend limit" until a payment method was added. Raise the limit before a long run.
- `transformers 4.46` pulls a protobuf too old for Modal's injected client; the image pins
  `protobuf>=5.27,<7`.
- `starmap` fans jobs across containers: 10 clips finished in 105 s wall clock instead of ~10 min
  sequential, for the same GPU-seconds.
- Warm containers are much cheaper than the first call: 49 s vs 75 s for the same 30 s clip.

## What does not work / not verified yet

- **Real singing quality is unmeasured.** The only local end-to-end run used synthetic speech, not a song. The PRD §48 acceptance test (≥7 of 10 real songs publishable) needs 10 songs you have rights to, placed in `apps/worker/samples/`, then `benchmark.py` + listening.
- ~~Cloud GPU timings/VRAM are estimates~~ **Done**: measured on Modal L4 (see above).
- Seed-VC's `inference.py` chooses its device itself (cuda → mps → cpu); the `--device` flag only steers Demucs and fp16. On MPS some ops fall back to CPU (`PYTORCH_ENABLE_MPS_FALLBACK=1` is set by the provider).
- No retry / timeout around the model subprocesses yet — a hung model process would hang the job. Fine for a CLI PoC; needed before the queue worker (Phase 3).

## GPU VRAM requirements (public numbers; confirm on cloud)

| Component | Typical VRAM | Note |
|---|---|---|
| Demucs `htdemucs`, 30 s, default segment | ~2–3 GB | `--segment` lowers it further |
| Seed-VC v1 f0 44k (DiT ~200M + Whisper-small encoder + BigVGAN 44k + RMVPE) | ~4–6 GB fp16 | fp32 on CPU/MPS uses more RAM (peaked ~8 GB RSS locally) |
| **Combined (sequential, same GPU)** | **≤ 8 GB** | fits T4 (16 GB), L4 (24 GB), A10 (24 GB) comfortably |

Conclusion: the cheapest tiers (T4/L4) are sufficient; no need for A100-class hardware.

## Estimated cloud GPU cost per 30-second generation

Modal on-demand prices (2026-09-09), 1,400 KRW/USD, cost = billed wall-clock seconds × price.

| GPU | KRW / GPU-sec | 30 s job | 60 s job | 90 s job | 120 s job |
|---|---|---|---|---|---|
| T4  | 0.230 | 6.9 | 13.8 | 20.7 | 27.6 |
| L4  | 0.311 | 9.3 | 18.6 | 28.0 | 37.3 |
| A10 | 0.428 | 12.9 | 25.7 | 38.6 | 51.4 |
| A100-40GB | 0.816 | 24.5 | 49.0 | 73.5 | 97.9 |

PRD thresholds: 40 KRW = "very good", 150 KRW = "feasible", 500 KRW = "optimise first".
On an L4 the 40 KRW line is crossed only after **129 s** of billed time and the 150 KRW line after **483 s**.
Published Seed-VC RTF on RTX 3060 is ~0.3–0.5 for singing (30 steps) and Demucs on a 30 s clip is a few seconds on any modern GPU, so a warm L4 job should land around **20–40 s → ≈ 6–12 KRW**. Even a pessimistic 2-minute job is ≈ 37 KRW.
Cold starts (container + ~3 GB weights) are the real cost risk: 60–120 s of extra billed time per cold container unless weights are baked into the image / snapshot (which `modal_benchmark.py` does).

Full cover (4 min ≈ 8× the audio) at the same RTF: 160–320 s on L4 ≈ 50–100 KRW vs. 2,900 KRW price → **2–4 % GPU cost ratio**, far under the 20 % target (PRD §20).

## Technical risks

1. **Quality of zero-shot SVC on real songs** (highest risk). Seed-VC is zero-shot from a 25 s reference; timbre similarity on sung vocals with vibrato/belting may be inconsistent. Mitigation: benchmark 10 songs; keep RVC (per-voice trained models, more consistent for a fixed catalogue of 3–10 voices) as the plan B behind the same interface.
2. **Backing-vocal / reverb bleed**: Demucs `vocals` stem carries harmonies and reverb that get converted too; sounds odd on dense mixes. Mitigation: pick preview sections with lead vocal; consider the 6-stem `htdemucs_6s` or a de-reverb step later.
3. **Pitch range mismatch** between song and voice (a female song on a male voice): f0-conditioned model keeps the source pitch, so results can sound strained. Mitigation: `--pitch-shift` (exposed in the CLI, hidden from users per PRD §44) chosen per voice, e.g. −12 for male voices on female songs.
4. **Dependency fragility**: Seed-VC pins `transformers 4.46.3` / `numpy 1.26` and needs `torchaudio.save` (torchaudio ≤ 2.8). Isolated venv + pinned file contains this, but upstream repo changes are unversioned (git `main`). Mitigation: pin a commit in `setup_seedvc.sh` once benchmark passes.
5. **Cold start vs. cost**: weights ≈ 3 GB. Must be baked into the image or a volume; otherwise every scale-from-zero costs more than the generation itself.
6. **Licensing**: BigVGAN (NVIDIA, MIT), Whisper (MIT), Demucs (MIT), Seed-VC (GPL-3.0 — matters if we distribute the worker; running it as a service is fine, but check before bundling), RMVPE weights from the RVC project.

## Recommended next phase

Do **not** start the web UI yet. Two short steps first, in this order:

1. **Cloud benchmark (≤ 1 day).** `modal setup`, run `modal_benchmark.py` on L4 (and T4 for the price floor) with the 10 real songs. Record: total seconds warm/cold, VRAM, cost. Fill the table above with measurements.
2. **Listening test (≤ 1 day).** Fill `review_template.csv`. If ≥ 7/10: proceed to Phase 1 (frontend mock) with Seed-VC. If < 7/10: try `--diffusion-steps 50`, per-voice `--pitch-shift`, and if still short, implement `RVCProvider` (same interface) with one trained voice and re-test before any web work.

Then Phase 1 as planned in PRD §48.
