# Phase 0 — AI Cover Generation PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command-line PoC in `apps/worker` that turns `song.mp3 + voice.wav + 30-sec section` into `cover.mp3` through `trim → Demucs → Seed-VC → mix`, and a benchmark command that measures per-stage time, GPU, VRAM and estimated cost.

**Architecture:** A small Python package (`coverly_worker`) where every heavy step is a *subprocess* to an existing tool (ffmpeg, `python -m demucs`, Seed-VC `inference.py` in its own venv). The pipeline only orchestrates files in a work directory and records timings. Source separation and voice conversion sit behind two tiny Protocols (`Separator`, `VoiceConversionProvider`) so Seed-VC can be swapped for RVC and Demucs for another separator without touching the pipeline. No web, no DB, no auth (PRD §54).

**Tech Stack:** Python 3.12 + uv (worker), ffmpeg/ffprobe 7.x, Demucs 4.1.0 (`htdemucs`), Seed-VC v1 (`DiT_seed_v2_uvit_whisper_base_f0_44k`, f0-conditioned, in a separate Python 3.11 venv under `apps/worker/vendor/seed-vc`), pytest. Optional: Modal for the real GPU benchmark.

**Spec:** `PRD.md` §15–§20, §33, §37, §48 (Phase 0), §53, §54 and the "Claude Code 실행 지시문".

## Global Constraints

- Do **not** implement web UI, auth, payment, DB, Explore before the PoC works (PRD §54).
- Preview mode trims **first**, then separates — never separate the whole song (PRD §16).
- Models are replaceable: Seed-VC and Demucs are behind interfaces; the pipeline never imports them directly (PRD §17, §53).
- Every generation records: audio duration, trim/separation/voice-conversion/mix/total seconds, device, GPU name, peak VRAM (PRD §19, §54).
- Intermediate files (`trimmed.wav`, `vocals.wav`, `no_vocals.wav`, `converted.wav`) live in a work dir and are deleted after success unless `--keep-work` (PRD §33).
- Default section = 30 s starting at 30 s (PRD §8). File inputs: mp3/wav/m4a.
- Report format (PRD §54) is printed verbatim after each generation:

  ```
  Generation completed

  Audio: 30.0 sec
  GPU: NVIDIA L4

  Trim: 0.8 sec
  Separation: 8.1 sec
  Voice Conversion: 19.4 sec
  Mix: 1.2 sec

  Total: 29.5 sec
  ```
- Simplicity over generality (PRD §53). No classes that exist only for future use.

## Unclear technical assumptions (recorded, decided for Phase 0)

| Assumption in PRD | Decision for Phase 0 |
|---|---|
| Seed-VC quality for singing is unverified | Use Seed-VC v1 f0-conditioned 44k model (its SVC model). Benchmark harness lets RVC be plugged in later. |
| GPU type / cost unknown | Local Mac (M3, no CUDA) validates the pipeline on CPU/MPS. Real numbers require a cloud GPU run; an optional Modal runner is provided. Cost = wall-clock seconds × Modal per-second price. |
| "Peak VRAM" measurement with subprocess-based models | Sample `nvidia-smi memory.used` from a background thread while separation + conversion run. `None` when no NVIDIA GPU. |
| How the reference voice is provided | `--voice` is a path to a 5–25 s clean vocal wav, or a name resolved under `apps/worker/voices/<name>.wav`. Seed-VC truncates references to 25 s. |
| Full-song generation | `--duration 0` means "to end of song" so the same CLI serves Phase 5 later. |
| Two torch installs (demucs venv + seed-vc venv) | Accepted for isolation; documented. |

## File Structure

```
ai-cover/
├── PRD.md
├── README.md                          # repo overview, phase status
├── .gitignore
├── docs/
│   ├── superpowers/plans/2026-09-09-phase0-ai-cover-poc.md
│   └── phase0-report.md               # filled after benchmark runs
├── apps/
│   ├── web/README.md                  # placeholder: Phase 1, not started
│   └── worker/
│       ├── pyproject.toml             # uv project; deps: demucs, pytest
│       ├── README.md                  # how to set up & run
│       ├── generate.py                # CLI entry → coverly_worker.cli:main
│       ├── benchmark.py               # CLI entry → coverly_worker.benchmark:main
│       ├── modal_benchmark.py         # optional cloud GPU runner (Modal)
│       ├── coverly_worker/
│       │   ├── __init__.py
│       │   ├── audio.py               # ffprobe/ffmpeg: probe_duration, trim, mix
│       │   ├── device.py              # detect_device, describe_gpu, VramSampler
│       │   ├── metrics.py             # StageTimer, GenerationMetrics, estimate_cost
│       │   ├── separation.py          # Separator protocol, DemucsSeparator, CopySeparator
│       │   ├── voice_conversion.py    # VoiceConversionProvider, SeedVCProvider, PassthroughProvider
│       │   ├── pipeline.py            # run_generation: trim → separate → convert → mix
│       │   ├── cli.py                 # argparse for generate.py (+ shared component args)
│       │   └── benchmark.py           # multi-sample runner + summary + cost
│       ├── scripts/
│       │   ├── setup_seedvc.sh        # clone Seed-VC into vendor/, create venv, install pinned deps
│       │   ├── seedvc-requirements.txt
│       │   └── make_fixtures.sh       # synthetic song + macOS `say` voice for a no-copyright smoke test
│       ├── voices/README.md           # where reference voices go (files gitignored)
│       ├── samples/.gitkeep           # user-provided songs (gitignored)
│       └── tests/
│           ├── conftest.py            # synthetic wav fixture (stdlib `wave`)
│           ├── test_audio.py
│           ├── test_metrics.py
│           ├── test_device.py
│           ├── test_separation.py
│           ├── test_voice_conversion.py
│           ├── test_pipeline.py
│           ├── test_cli.py
│           └── test_benchmark.py
└── packages/shared/README.md          # placeholder for later phases
```

Responsibilities: `audio.py` knows ffmpeg; `separation.py` knows demucs; `voice_conversion.py` knows Seed-VC; `pipeline.py` knows none of them, only the two Protocols; `metrics.py` knows nothing about audio.

---

### Task 1: Repository skeleton and worker project

**Files:**
- Create: `.gitignore`, `README.md`, `apps/web/README.md`, `packages/shared/README.md`, `apps/worker/pyproject.toml`, `apps/worker/coverly_worker/__init__.py`, `apps/worker/tests/conftest.py`, `apps/worker/samples/.gitkeep`, `apps/worker/voices/README.md`

**Interfaces:**
- Produces: pytest fixture `tone_wav(name, seconds, freq, rate, channels) -> Path` used by every later test.

- [x] **Step 1: Initialise git and write ignore rules**

```bash
git init -b main
```

`.gitignore`:
```
# python
__pycache__/
*.pyc
.venv/
.pytest_cache/
*.egg-info/
# worker artefacts
apps/worker/vendor/
apps/worker/samples/*
!apps/worker/samples/.gitkeep
apps/worker/voices/*
!apps/worker/voices/README.md
apps/worker/bench_out/
apps/worker/work/
apps/worker/output*.mp3
apps/worker/checkpoints/
# node (later phases)
node_modules/
.next/
# os
.DS_Store
```

- [x] **Step 2: Create worker pyproject (uv)**

`apps/worker/pyproject.toml`:
```toml
[project]
name = "coverly-worker"
version = "0.0.1"
description = "Coverly GPU worker — Phase 0 CLI PoC (trim → Demucs → Seed-VC → mix)"
requires-python = ">=3.12"
dependencies = [
    "demucs==4.1.0",
]

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = ["integration: runs real models; enable with COVERLY_RUN_INTEGRATION=1"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["coverly_worker"]
```

- [x] **Step 3: Write the shared test fixture**

`apps/worker/tests/conftest.py`:
```python
import math
import struct
import wave
from pathlib import Path

import pytest


@pytest.fixture
def tone_wav(tmp_path: Path):
    """Create a small PCM16 sine-wave WAV without any third-party dependency."""

    def _make(name: str = "tone.wav", seconds: float = 2.0, freq: float = 440.0,
              rate: int = 44100, channels: int = 2) -> Path:
        path = tmp_path / name
        n_frames = int(seconds * rate)
        frames = bytearray()
        for i in range(n_frames):
            sample = int(12000 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", sample) * channels
        with wave.open(str(path), "wb") as w:
            w.setnchannels(channels)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(bytes(frames))
        return path

    return _make
```

- [x] **Step 4: Install and verify the empty test suite runs**

```bash
cd apps/worker && uv sync --python 3.12 && uv run pytest -q
```
Expected: `no tests ran` (exit code 5 is fine), torch + demucs installed.

- [x] **Step 5: Placeholder READMEs**

`apps/web/README.md`: "Phase 1 (frontend mock) — intentionally empty until the Phase 0 audio PoC passes (PRD §54)."
`packages/shared/README.md`: "Shared types for web ⇄ worker. Empty until Phase 2."
`apps/worker/voices/README.md`: what a reference voice must be (5–25 s, single singer, no music/reverb, wav 44.1 kHz mono or stereo), naming convention `voices/<voice_id>.wav`, licensing note (PRD §4: only voices you have rights to).

---

### Task 2: ffmpeg wrappers — probe, trim, mix

**Files:**
- Create: `apps/worker/coverly_worker/audio.py`
- Test: `apps/worker/tests/test_audio.py`

**Interfaces:**
- Produces:
  - `probe_duration(path: Path) -> float`
  - `trim(input_path: Path, output_path: Path, start: float, duration: float | None, sample_rate: int = 44100, channels: int = 2) -> Path` (PCM16 wav)
  - `mix(vocals_path: Path, instrumental_path: Path, output_path: Path, vocal_gain_db: float = 0.0, instrumental_gain_db: float = 0.0, bitrate: str = "192k") -> Path` (mp3)
  - `class FfmpegError(RuntimeError)`

- [x] **Step 1: Failing tests**

`tests/test_audio.py`:
```python
from pathlib import Path

import pytest

from coverly_worker.audio import FfmpegError, mix, probe_duration, trim


def test_probe_duration_reads_wav_length(tone_wav):
    path = tone_wav(seconds=2.0)
    assert probe_duration(path) == pytest.approx(2.0, abs=0.05)


def test_probe_duration_raises_on_missing_file(tmp_path):
    with pytest.raises(FfmpegError):
        probe_duration(tmp_path / "nope.wav")


def test_trim_cuts_requested_window(tone_wav, tmp_path):
    src = tone_wav(seconds=3.0)
    out = trim(src, tmp_path / "trimmed.wav", start=0.5, duration=1.0)
    assert out.exists()
    assert probe_duration(out) == pytest.approx(1.0, abs=0.05)


def test_trim_without_duration_runs_to_end(tone_wav, tmp_path):
    src = tone_wav(seconds=3.0)
    out = trim(src, tmp_path / "tail.wav", start=1.0, duration=None)
    assert probe_duration(out) == pytest.approx(2.0, abs=0.05)


def test_mix_produces_mp3_of_longest_input(tone_wav, tmp_path):
    vocals = tone_wav("vocals.wav", seconds=1.5, freq=660.0, channels=1)
    inst = tone_wav("inst.wav", seconds=2.0, freq=220.0)
    out = mix(vocals, inst, tmp_path / "cover.mp3")
    assert out.exists() and out.stat().st_size > 1000
    assert probe_duration(out) == pytest.approx(2.0, abs=0.15)
```

- [x] **Step 2: Run to confirm failure** — `uv run pytest tests/test_audio.py -q` → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/audio.py`:
```python
"""Thin wrappers around the ffmpeg/ffprobe binaries. No audio DSP happens in Python."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class FfmpegError(RuntimeError):
    """ffmpeg/ffprobe missing or exited non-zero."""


def _binary(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise FfmpegError(f"'{name}' not found on PATH. Install ffmpeg (brew install ffmpeg / apt install ffmpeg).")
    return path


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FfmpegError(f"command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}")
    return proc


def probe_duration(path: Path) -> float:
    """Return media duration in seconds using ffprobe."""
    cmd = [_binary("ffprobe"), "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", str(path)]
    out = _run(cmd).stdout.strip()
    try:
        return float(out)
    except ValueError as exc:
        raise FfmpegError(f"could not read duration of {path}: {out!r}") from exc


def trim(input_path: Path, output_path: Path, start: float, duration: float | None,
         sample_rate: int = 44100, channels: int = 2) -> Path:
    """Cut [start, start+duration) (or start→end when duration is None) to a PCM16 WAV.

    Always re-encodes to a fixed sample rate / channel count so downstream models get
    a predictable input regardless of the uploaded format (mp3/wav/m4a).
    """
    cmd = [_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}"]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += ["-i", str(input_path), "-vn", "-ac", str(channels), "-ar", str(sample_rate),
            "-c:a", "pcm_s16le", str(output_path)]
    _run(cmd)
    return output_path


def mix(vocals_path: Path, instrumental_path: Path, output_path: Path,
        vocal_gain_db: float = 0.0, instrumental_gain_db: float = 0.0, bitrate: str = "192k") -> Path:
    """Sum converted vocals over the instrumental and encode to MP3.

    amix with normalize=0 keeps both stems at their original level; a limiter stops clipping.
    duration=longest so a slightly shorter converted vocal never truncates the instrumental.
    """
    filter_graph = (
        f"[0:a]aresample=44100,aformat=channel_layouts=stereo,volume={vocal_gain_db}dB[v];"
        f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={instrumental_gain_db}dB[i];"
        "[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false"
    )
    cmd = [_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
           "-i", str(vocals_path), "-i", str(instrumental_path),
           "-filter_complex", filter_graph, "-c:a", "libmp3lame", "-b:a", bitrate, str(output_path)]
    _run(cmd)
    return output_path
```

- [x] **Step 4: Run** — `uv run pytest tests/test_audio.py -q` → 5 passed.

---

### Task 3: Metrics — stage timer, report, cost estimate

**Files:**
- Create: `apps/worker/coverly_worker/metrics.py`
- Test: `apps/worker/tests/test_metrics.py`

**Interfaces:**
- Produces:
  - `class StageTimer` with `stage(name) -> contextmanager`, `.stages: dict[str, float]`, `.total() -> float`
  - `@dataclass GenerationMetrics(audio_duration_seconds, trim_seconds, separation_seconds, voice_conversion_seconds, mixing_seconds, total_seconds, device: str, gpu_name: str | None = None, peak_vram_mb: float | None = None, separator: str = "", provider: str = "")` with `.to_dict()`, `.format_report() -> str`
  - `GPU_PRICES_USD_PER_SECOND: dict[str, float]` (Modal on-demand, 2026-09-09)
  - `@dataclass CostEstimate(gpu, billed_seconds, usd, krw)`; `estimate_cost(billed_seconds, gpu="L4", usd_per_second=None, usd_krw=1400.0) -> CostEstimate`

- [x] **Step 1: Failing tests**

`tests/test_metrics.py`:
```python
import pytest

from coverly_worker.metrics import (GPU_PRICES_USD_PER_SECOND, GenerationMetrics, StageTimer,
                                    estimate_cost)


def test_stage_timer_records_each_stage_and_total():
    timer = StageTimer()
    with timer.stage("trim"):
        pass
    with timer.stage("separation"):
        pass
    assert set(timer.stages) == {"trim", "separation"}
    assert timer.total() == pytest.approx(sum(timer.stages.values()))


def _metrics(**overrides) -> GenerationMetrics:
    base = dict(audio_duration_seconds=30.0, trim_seconds=0.8, separation_seconds=8.1,
                voice_conversion_seconds=19.4, mixing_seconds=1.2, total_seconds=29.5,
                device="cuda", gpu_name="NVIDIA L4", peak_vram_mb=5120.0,
                separator="demucs", provider="seedvc")
    base.update(overrides)
    return GenerationMetrics(**base)


def test_report_matches_prd_format():
    report = _metrics().format_report()
    assert "Generation completed" in report
    assert "Audio: 30.0 sec" in report
    assert "GPU: NVIDIA L4" in report
    assert "Trim: 0.8 sec" in report
    assert "Separation: 8.1 sec" in report
    assert "Voice Conversion: 19.4 sec" in report
    assert "Mix: 1.2 sec" in report
    assert "Total: 29.5 sec" in report
    assert "Peak VRAM: 5120 MB" in report


def test_report_without_gpu_says_cpu():
    report = _metrics(device="cpu", gpu_name=None, peak_vram_mb=None).format_report()
    assert "GPU: none (cpu)" in report
    assert "Peak VRAM" not in report


def test_to_dict_roundtrips_all_fields():
    d = _metrics().to_dict()
    assert d["voice_conversion_seconds"] == 19.4
    assert d["provider"] == "seedvc"


def test_estimate_cost_uses_gpu_table_and_fx():
    cost = estimate_cost(30.0, gpu="L4", usd_krw=1400.0)
    assert cost.usd == pytest.approx(30.0 * GPU_PRICES_USD_PER_SECOND["L4"])
    assert cost.krw == pytest.approx(cost.usd * 1400.0)


def test_estimate_cost_accepts_explicit_price():
    cost = estimate_cost(10.0, gpu="custom", usd_per_second=0.001, usd_krw=1000.0)
    assert cost.usd == pytest.approx(0.01)
    assert cost.krw == pytest.approx(10.0)


def test_estimate_cost_unknown_gpu_without_price_raises():
    with pytest.raises(KeyError):
        estimate_cost(10.0, gpu="RTX9999")
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/metrics.py`:
```python
"""Timing, reporting and cost estimation for one generation. Knows nothing about audio."""
from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from typing import Iterator

# Modal on-demand GPU prices, USD per GPU-second. Source: https://modal.com/pricing (2026-09-09).
# The benchmark multiplies wall-clock seconds by these — CPU/memory add-ons are ignored (<5%).
GPU_PRICES_USD_PER_SECOND: dict[str, float] = {
    "T4": 0.000164,
    "L4": 0.000222,
    "A10": 0.000306,
    "L40S": 0.000542,
    "A100-40GB": 0.000583,
    "A100-80GB": 0.000694,
    "H100": 0.001097,
}


class StageTimer:
    """Wall-clock stopwatch keyed by stage name."""

    def __init__(self) -> None:
        self.stages: dict[str, float] = {}

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        started = time.perf_counter()
        try:
            yield
        finally:
            self.stages[name] = self.stages.get(name, 0.0) + (time.perf_counter() - started)

    def total(self) -> float:
        return sum(self.stages.values())


@dataclass
class GenerationMetrics:
    audio_duration_seconds: float
    trim_seconds: float
    separation_seconds: float
    voice_conversion_seconds: float
    mixing_seconds: float
    total_seconds: float
    device: str
    gpu_name: str | None = None
    peak_vram_mb: float | None = None
    separator: str = ""
    provider: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def realtime_factor(self) -> float:
        """Processing seconds per second of audio (lower is faster; <1 means faster than realtime)."""
        return self.total_seconds / self.audio_duration_seconds if self.audio_duration_seconds else float("inf")

    def format_report(self) -> str:
        gpu = self.gpu_name or f"none ({self.device})"
        lines = [
            "Generation completed",
            "",
            f"Audio: {self.audio_duration_seconds:.1f} sec",
            f"GPU: {gpu}",
            "",
            f"Trim: {self.trim_seconds:.1f} sec",
            f"Separation: {self.separation_seconds:.1f} sec",
            f"Voice Conversion: {self.voice_conversion_seconds:.1f} sec",
            f"Mix: {self.mixing_seconds:.1f} sec",
            "",
            f"Total: {self.total_seconds:.1f} sec",
            f"Realtime factor: {self.realtime_factor():.2f}x",
        ]
        if self.peak_vram_mb is not None:
            lines.append(f"Peak VRAM: {self.peak_vram_mb:.0f} MB")
        return "\n".join(lines)


@dataclass
class CostEstimate:
    gpu: str
    billed_seconds: float
    usd: float
    krw: float


def estimate_cost(billed_seconds: float, gpu: str = "L4", usd_per_second: float | None = None,
                  usd_krw: float = 1400.0) -> CostEstimate:
    """Cost of one generation if the whole wall-clock time is billed on `gpu`."""
    price = usd_per_second if usd_per_second is not None else GPU_PRICES_USD_PER_SECOND[gpu]
    usd = billed_seconds * price
    return CostEstimate(gpu=gpu, billed_seconds=billed_seconds, usd=usd, krw=usd * usd_krw)
```

- [x] **Step 4: Run** → 8 passed.

---

### Task 4: Device detection and VRAM sampling

**Files:**
- Create: `apps/worker/coverly_worker/device.py`
- Test: `apps/worker/tests/test_device.py`

**Interfaces:**
- Produces:
  - `detect_device(preferred: str = "auto") -> str` → `"cuda" | "mps" | "cpu"`
  - `describe_gpu(device: str) -> str | None`
  - `class VramSampler(interval: float = 0.5, query=None)` context manager; `.peak_mb: float | None`; `.available: bool`

- [x] **Step 1: Failing tests**

`tests/test_device.py`:
```python
import time

from coverly_worker.device import VramSampler, describe_gpu, detect_device


def test_detect_device_honours_explicit_choice():
    assert detect_device("cpu") == "cpu"
    assert detect_device("cuda") == "cuda"


def test_detect_device_auto_returns_known_value():
    assert detect_device("auto") in {"cuda", "mps", "cpu"}


def test_describe_gpu_cpu_is_none():
    assert describe_gpu("cpu") is None


def test_vram_sampler_tracks_peak_from_injected_query():
    readings = iter([1000.0, 4200.0, 3000.0])
    sampler = VramSampler(interval=0.01, query=lambda: next(readings, 3000.0))
    with sampler:
        time.sleep(0.1)
    assert sampler.available is True
    assert sampler.peak_mb == 4200.0


def test_vram_sampler_without_nvidia_smi_reports_none():
    sampler = VramSampler(interval=0.01, query=None, nvidia_smi_path=None)
    with sampler:
        pass
    assert sampler.available is False
    assert sampler.peak_mb is None
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/device.py`:
```python
"""Where do we run, and how much GPU memory did the job use?"""
from __future__ import annotations

import platform
import shutil
import subprocess
import threading
from typing import Callable


def detect_device(preferred: str = "auto") -> str:
    """Pick cuda → mps → cpu. Explicit values are returned untouched."""
    if preferred != "auto":
        return preferred
    try:
        import torch  # heavy import, kept local
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def describe_gpu(device: str) -> str | None:
    if device == "cuda":
        try:
            import torch
            return torch.cuda.get_device_name(0)
        except Exception:  # noqa: BLE001 - best effort label only
            return "cuda"
    if device == "mps":
        chip = "Apple Silicon"
        if platform.system() == "Darwin":
            try:
                chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                      capture_output=True, text=True, check=True).stdout.strip() or chip
            except Exception:  # noqa: BLE001
                pass
        return f"{chip} (MPS)"
    return None


def _nvidia_smi_used_mb(nvidia_smi: str) -> float:
    out = subprocess.run([nvidia_smi, "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True, check=True).stdout
    return max(float(line) for line in out.split() if line.strip())


class VramSampler:
    """Polls GPU memory in a background thread and keeps the peak (MB).

    Models run in subprocesses, so torch's in-process allocator stats are useless here;
    nvidia-smi is the lowest-common-denominator that works for any child process.
    `query` can be injected for tests. Without nvidia-smi the sampler is a no-op.
    """

    def __init__(self, interval: float = 0.5, query: Callable[[], float] | None = None,
                 nvidia_smi_path: str | None = "auto") -> None:
        self.interval = interval
        if query is None and nvidia_smi_path is not None:
            path = shutil.which("nvidia-smi") if nvidia_smi_path == "auto" else nvidia_smi_path
            if path:
                query = lambda: _nvidia_smi_used_mb(path)  # noqa: E731
        self._query = query
        self.available = query is not None
        self.peak_mb: float | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _loop(self) -> None:
        assert self._query is not None
        while not self._stop.is_set():
            try:
                value = self._query()
                self.peak_mb = value if self.peak_mb is None else max(self.peak_mb, value)
            except Exception:  # noqa: BLE001 - a failed sample must not kill the job
                pass
            self._stop.wait(self.interval)

    def __enter__(self) -> "VramSampler":
        if self.available:
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
```

- [x] **Step 4: Run** → 5 passed.

---

### Task 5: Source separation behind an interface (Demucs)

**Files:**
- Create: `apps/worker/coverly_worker/separation.py`
- Test: `apps/worker/tests/test_separation.py`

**Interfaces:**
- Produces:
  - `Runner = Callable[..., None]` — `runner(cmd: list[str], cwd: Path | None = None, env: dict | None = None)`; `default_runner` raises `SubprocessError` on non-zero exit
  - `@dataclass SeparatedStems(vocals: Path, instrumental: Path)`
  - `class Separator(Protocol)`: `name: str`; `separate(audio_path: Path, work_dir: Path) -> SeparatedStems`
  - `class DemucsSeparator(model="htdemucs", device="cpu", python=sys.executable, runner=default_runner, segment: int | None = None, shifts: int = 1)` with `build_command(audio_path, out_dir) -> list[str]`
  - `class CopySeparator` (vocals = instrumental = copy of input; for tests and dry runs)
  - `class SeparationError(RuntimeError)`

- [x] **Step 1: Failing tests**

`tests/test_separation.py`:
```python
import os
from pathlib import Path

import pytest

from coverly_worker.separation import (CopySeparator, DemucsSeparator, SeparationError,
                                       SubprocessError, default_runner)


def test_demucs_command_has_two_stems_and_output_layout(tmp_path):
    sep = DemucsSeparator(model="htdemucs", device="cpu", python="/venv/bin/python")
    cmd = sep.build_command(Path("/in/trimmed.wav"), tmp_path / "separated")
    assert cmd[:3] == ["/venv/bin/python", "-m", "demucs"]
    assert "--two-stems" in cmd and cmd[cmd.index("--two-stems") + 1] == "vocals"
    assert cmd[cmd.index("-n") + 1] == "htdemucs"
    assert cmd[cmd.index("-d") + 1] == "cpu"
    assert cmd[cmd.index("--filename") + 1] == "{stem}.{ext}"
    assert cmd[-1] == "/in/trimmed.wav"


def test_demucs_separate_returns_stems_written_by_runner(tmp_path):
    def fake_runner(cmd, cwd=None, env=None):
        out_dir = Path(cmd[cmd.index("-o") + 1]) / "htdemucs"
        out_dir.mkdir(parents=True)
        (out_dir / "vocals.wav").write_bytes(b"v")
        (out_dir / "no_vocals.wav").write_bytes(b"i")

    sep = DemucsSeparator(runner=fake_runner)
    stems = sep.separate(tmp_path / "trimmed.wav", tmp_path)
    assert stems.vocals.read_bytes() == b"v"
    assert stems.instrumental.read_bytes() == b"i"


def test_demucs_separate_raises_when_outputs_missing(tmp_path):
    sep = DemucsSeparator(runner=lambda cmd, cwd=None, env=None: None)
    with pytest.raises(SeparationError):
        sep.separate(tmp_path / "trimmed.wav", tmp_path)


def test_copy_separator_duplicates_input(tone_wav, tmp_path):
    src = tone_wav()
    stems = CopySeparator().separate(src, tmp_path)
    assert stems.vocals.read_bytes() == src.read_bytes()
    assert stems.instrumental.read_bytes() == src.read_bytes()
    assert stems.vocals != stems.instrumental


def test_default_runner_raises_with_stderr():
    with pytest.raises(SubprocessError, match="boom"):
        default_runner(["sh", "-c", "echo boom >&2; exit 3"])


@pytest.mark.integration
@pytest.mark.skipif(not os.environ.get("COVERLY_RUN_INTEGRATION"), reason="set COVERLY_RUN_INTEGRATION=1")
def test_real_demucs_on_tone(tone_wav, tmp_path):
    from coverly_worker.audio import probe_duration
    src = tone_wav(seconds=4.0)
    stems = DemucsSeparator(device="cpu").separate(src, tmp_path)
    assert probe_duration(stems.vocals) == pytest.approx(4.0, abs=0.1)
    assert probe_duration(stems.instrumental) == pytest.approx(4.0, abs=0.1)
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/separation.py`:
```python
"""Source separation: vocals vs. everything else. Demucs is invoked as a subprocess so it can be
replaced by any other tool (or a remote service) without touching the pipeline."""
from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol


class SubprocessError(RuntimeError):
    """A child tool exited non-zero; message carries the tail of stderr."""


class SeparationError(RuntimeError):
    """Separator finished but the expected stems are missing."""


Runner = Callable[..., None]


def default_runner(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SubprocessError(f"command failed ({proc.returncode}): {' '.join(cmd)}\n"
                              f"{proc.stderr[-3000:]}")


@dataclass(frozen=True)
class SeparatedStems:
    vocals: Path
    instrumental: Path


class Separator(Protocol):
    name: str

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems: ...


class DemucsSeparator:
    """`python -m demucs --two-stems vocals` → work_dir/separated/<model>/{vocals,no_vocals}.wav"""

    name = "demucs"

    def __init__(self, model: str = "htdemucs", device: str = "cpu", python: str = sys.executable,
                 runner: Runner = default_runner, segment: int | None = None, shifts: int = 1) -> None:
        self.model = model
        self.device = device
        self.python = python
        self.runner = runner
        self.segment = segment
        self.shifts = shifts

    def build_command(self, audio_path: Path, out_dir: Path) -> list[str]:
        cmd = [self.python, "-m", "demucs", "-n", self.model, "--two-stems", "vocals",
               "-d", self.device, "-o", str(out_dir), "--filename", "{stem}.{ext}",
               "--shifts", str(self.shifts)]
        if self.segment:
            cmd += ["--segment", str(self.segment)]
        cmd.append(str(audio_path))
        return cmd

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems:
        out_dir = work_dir / "separated"
        self.runner(self.build_command(audio_path, out_dir))
        stems = SeparatedStems(vocals=out_dir / self.model / "vocals.wav",
                               instrumental=out_dir / self.model / "no_vocals.wav")
        for path in (stems.vocals, stems.instrumental):
            if not path.exists():
                raise SeparationError(f"demucs did not produce {path}")
        return stems


class CopySeparator:
    """No-op separator for tests/dry runs: both stems are copies of the input."""

    name = "copy"

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems:
        out_dir = work_dir / "separated" / "copy"
        out_dir.mkdir(parents=True, exist_ok=True)
        vocals = shutil.copy(audio_path, out_dir / "vocals.wav")
        inst = shutil.copy(audio_path, out_dir / "no_vocals.wav")
        return SeparatedStems(vocals=Path(vocals), instrumental=Path(inst))
```

- [x] **Step 4: Run** → 5 passed, 1 skipped. Then `COVERLY_RUN_INTEGRATION=1 uv run pytest tests/test_separation.py -q -m integration` once to confirm Demucs really runs (downloads `htdemucs` weights, ~80 MB).

---

### Task 6: Voice conversion behind an interface (Seed-VC)

**Files:**
- Create: `apps/worker/coverly_worker/voice_conversion.py`
- Test: `apps/worker/tests/test_voice_conversion.py`

**Interfaces:**
- Produces:
  - `class VoiceConversionProvider(Protocol)`: `name: str`; `convert(vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path` (mirrors PRD §17 `convert({vocalPath, voiceId, pitchShift})`)
  - `resolve_voice(voice_id: str, voices_dir: Path) -> Path`
  - `class PassthroughProvider`
  - `class SeedVCProvider(repo_dir: Path, python: Path | None = None, voices_dir: Path = Path("voices"), diffusion_steps: int = 30, inference_cfg_rate: float = 0.7, length_adjust: float = 1.0, f0_condition: bool = True, auto_f0_adjust: bool = False, fp16: bool | None = None, device: str = "cpu", runner=default_runner)` with `build_command(vocal_path, reference_path, out_dir, pitch_shift) -> list[str]`
  - `class VoiceConversionError(RuntimeError)`

- [x] **Step 1: Failing tests**

`tests/test_voice_conversion.py`:
```python
from pathlib import Path

import pytest

from coverly_worker.voice_conversion import (PassthroughProvider, SeedVCProvider,
                                             VoiceConversionError, resolve_voice)


def test_resolve_voice_accepts_direct_path(tone_wav, tmp_path):
    ref = tone_wav("ref.wav")
    assert resolve_voice(str(ref), tmp_path / "voices") == ref


def test_resolve_voice_looks_up_named_voice(tmp_path):
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "warm_male.wav").write_bytes(b"x")
    assert resolve_voice("warm_male", voices) == voices / "warm_male.wav"


def test_resolve_voice_missing_raises(tmp_path):
    with pytest.raises(VoiceConversionError, match="nope"):
        resolve_voice("nope", tmp_path)


def test_passthrough_copies_vocals(tone_wav, tmp_path):
    vocals = tone_wav("vocals.wav")
    out = PassthroughProvider().convert(vocals, "any", tmp_path)
    assert out.read_bytes() == vocals.read_bytes()
    assert out != vocals


def test_seedvc_command_for_singing_on_cpu(tmp_path):
    provider = SeedVCProvider(repo_dir=tmp_path / "seed-vc", python=Path("/venv/bin/python"),
                              diffusion_steps=40, device="cpu")
    cmd = provider.build_command(Path("/w/vocals.wav"), Path("/voices/a.wav"), tmp_path / "out", pitch_shift=2)
    assert cmd[:2] == ["/venv/bin/python", "inference.py"]
    assert cmd[cmd.index("--source") + 1] == "/w/vocals.wav"
    assert cmd[cmd.index("--target") + 1] == "/voices/a.wav"
    assert cmd[cmd.index("--output") + 1] == str(tmp_path / "out")
    assert cmd[cmd.index("--diffusion-steps") + 1] == "40"
    assert cmd[cmd.index("--f0-condition") + 1] == "True"
    assert cmd[cmd.index("--auto-f0-adjust") + 1] == "False"
    assert cmd[cmd.index("--semi-tone-shift") + 1] == "2"
    assert cmd[cmd.index("--fp16") + 1] == "False"


def test_seedvc_fp16_defaults_true_on_cuda(tmp_path):
    provider = SeedVCProvider(repo_dir=tmp_path, python=Path("/p"), device="cuda")
    cmd = provider.build_command(Path("/v.wav"), Path("/r.wav"), tmp_path / "o", pitch_shift=0)
    assert cmd[cmd.index("--fp16") + 1] == "True"


def test_seedvc_convert_returns_newest_wav_and_runs_in_repo_dir(tmp_path):
    repo = tmp_path / "seed-vc"
    repo.mkdir()
    (repo / "inference.py").write_text("")
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "a.wav").write_bytes(b"ref")
    seen = {}

    def fake_runner(cmd, cwd=None, env=None):
        seen["cwd"], seen["env"] = cwd, env
        out_dir = Path(cmd[cmd.index("--output") + 1])
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "vc_vocals_a_1.0_30_0.7.wav").write_bytes(b"converted")

    provider = SeedVCProvider(repo_dir=repo, python=Path("/p"), voices_dir=voices, runner=fake_runner)
    out = provider.convert(tmp_path / "vocals.wav", "a", tmp_path / "work")
    assert out.read_bytes() == b"converted"
    assert seen["cwd"] == repo
    assert seen["env"]["PYTORCH_ENABLE_MPS_FALLBACK"] == "1"


def test_seedvc_convert_without_output_raises(tmp_path):
    repo = tmp_path / "seed-vc"
    repo.mkdir()
    (repo / "inference.py").write_text("")
    ref = tmp_path / "r.wav"
    ref.write_bytes(b"")
    provider = SeedVCProvider(repo_dir=repo, python=Path("/p"), runner=lambda cmd, cwd=None, env=None: None)
    with pytest.raises(VoiceConversionError):
        provider.convert(tmp_path / "vocals.wav", str(ref), tmp_path / "work")


def test_seedvc_requires_repo_checkout(tmp_path):
    with pytest.raises(VoiceConversionError, match="setup_seedvc"):
        SeedVCProvider(repo_dir=tmp_path / "missing", python=Path("/p")).convert(
            tmp_path / "v.wav", str(tmp_path / "v.wav"), tmp_path)
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/voice_conversion.py`:
```python
"""Voice conversion providers. The pipeline only sees `VoiceConversionProvider`; Seed-VC is one
implementation, invoked as a subprocess inside its own virtualenv so its heavy, pinned dependency
set never leaks into the worker. Swapping to RVC = writing another ~40-line class here."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import Protocol

from .separation import Runner, default_runner

VOICE_EXTENSIONS = (".wav", ".flac", ".mp3", ".m4a")


class VoiceConversionError(RuntimeError):
    pass


class VoiceConversionProvider(Protocol):
    name: str

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path: ...


def resolve_voice(voice_id: str, voices_dir: Path) -> Path:
    """`voice_id` is either a path to a reference recording or a name under `voices_dir`."""
    direct = Path(voice_id)
    if direct.is_file():
        return direct
    for ext in VOICE_EXTENSIONS:
        candidate = voices_dir / f"{voice_id}{ext}"
        if candidate.is_file():
            return candidate
    raise VoiceConversionError(f"voice '{voice_id}' not found (looked for a file path or {voices_dir}/{voice_id}.wav)")


class PassthroughProvider:
    """Returns the vocals unchanged. Used for tests and to measure non-model overhead."""

    name = "passthrough"

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path:
        work_dir.mkdir(parents=True, exist_ok=True)
        return Path(shutil.copy(vocal_path, work_dir / "converted.wav"))


class SeedVCProvider:
    """Seed-VC v1 (`inference.py`) with the f0-conditioned 44.1 kHz singing model.

    Seed-VC writes `vc_<src>_<ref>_<len>_<steps>_<cfg>.wav` into `--output`; we give it a fresh
    directory per call and take the newest wav so a filename change upstream cannot break us.
    It also caches checkpoints under `./checkpoints` relative to cwd, hence `cwd=repo_dir`.
    """

    name = "seedvc"

    def __init__(self, repo_dir: Path, python: Path | None = None, voices_dir: Path = Path("voices"),
                 diffusion_steps: int = 30, inference_cfg_rate: float = 0.7, length_adjust: float = 1.0,
                 f0_condition: bool = True, auto_f0_adjust: bool = False, fp16: bool | None = None,
                 device: str = "cpu", runner: Runner = default_runner) -> None:
        self.repo_dir = Path(repo_dir)
        default_python = self.repo_dir / ".venv" / "bin" / "python"
        self.python = Path(python) if python else (default_python if default_python.exists() else Path(sys.executable))
        self.voices_dir = Path(voices_dir)
        self.diffusion_steps = diffusion_steps
        self.inference_cfg_rate = inference_cfg_rate
        self.length_adjust = length_adjust
        self.f0_condition = f0_condition
        self.auto_f0_adjust = auto_f0_adjust
        self.fp16 = (device == "cuda") if fp16 is None else fp16  # fp16 autocast is CUDA-only in practice
        self.device = device
        self.runner = runner

    def build_command(self, vocal_path: Path, reference_path: Path, out_dir: Path, pitch_shift: int) -> list[str]:
        return [str(self.python), "inference.py",
                "--source", str(vocal_path),
                "--target", str(reference_path),
                "--output", str(out_dir),
                "--diffusion-steps", str(self.diffusion_steps),
                "--length-adjust", str(self.length_adjust),
                "--inference-cfg-rate", str(self.inference_cfg_rate),
                "--f0-condition", str(self.f0_condition),
                "--auto-f0-adjust", str(self.auto_f0_adjust),
                "--semi-tone-shift", str(pitch_shift),
                "--fp16", str(self.fp16)]

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path:
        if not (self.repo_dir / "inference.py").is_file():
            raise VoiceConversionError(f"Seed-VC checkout not found at {self.repo_dir}. "
                                       "Run apps/worker/scripts/setup_seedvc.sh first.")
        reference = resolve_voice(voice_id, self.voices_dir).resolve()
        out_dir = (work_dir / "seedvc_out").resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"}
        self.runner(self.build_command(vocal_path.resolve(), reference, out_dir, pitch_shift),
                    cwd=self.repo_dir, env=env)
        outputs = sorted(out_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime)
        if not outputs:
            raise VoiceConversionError(f"Seed-VC produced no wav in {out_dir}")
        return outputs[-1]
```

- [x] **Step 4: Run** → 9 passed.

- [x] **Step 5 (added during execution): Seed-VC launcher shim.** The first real run failed on Apple
  Silicon: `inference.py:329 torch.from_numpy(F0_ori).to(device)` — RMVPE returns float64 and MPS has
  no float64. Seed-VC has no device flag, so `SeedVCProvider` launches `coverly_worker/seedvc_shim.py`
  (standalone, executed by the vendor venv, cwd = repo) instead of `inference.py` directly. The shim
  reads `SEEDVC_DEVICE` (passed by the provider from `--device`): `cpu` hides CUDA/MPS, `mps` wraps
  `torch.from_numpy` to cast float64 → float32, `cuda` is untouched. `build_command` therefore starts
  with `[python, .../seedvc_shim.py, "--source", ...]`.

---

### Task 7: Pipeline orchestration

**Files:**
- Create: `apps/worker/coverly_worker/pipeline.py`
- Test: `apps/worker/tests/test_pipeline.py`

**Interfaces:**
- Consumes: `audio.probe_duration/trim/mix`, `metrics.StageTimer/GenerationMetrics`, `device.describe_gpu/VramSampler`, `Separator`, `VoiceConversionProvider`
- Produces:
  - `@dataclass GenerationRequest(input_path: Path, voice_id: str, output_path: Path, start: float = 30.0, duration: float | None = 30.0, pitch_shift: int = 0, work_dir: Path | None = None, keep_work: bool = False)`
  - `@dataclass GenerationResult(output_path: Path, metrics: GenerationMetrics, effective_start: float, work_dir: Path | None)`
  - `clamp_section(total: float, start: float, duration: float | None) -> tuple[float, float | None]`
  - `run_generation(request, separator, provider, device: str = "cpu", vram_sampler: VramSampler | None = None) -> GenerationResult`

- [x] **Step 1: Failing tests**

`tests/test_pipeline.py`:
```python
from pathlib import Path

import pytest

from coverly_worker.audio import probe_duration
from coverly_worker.pipeline import GenerationRequest, clamp_section, run_generation
from coverly_worker.separation import CopySeparator
from coverly_worker.voice_conversion import PassthroughProvider


@pytest.mark.parametrize("total,start,duration,expected", [
    (240.0, 30.0, 30.0, (30.0, 30.0)),      # normal
    (240.0, 230.0, 30.0, (210.0, 30.0)),    # slides window back to fit
    (20.0, 30.0, 30.0, (0.0, 20.0)),        # song shorter than section → whole song
    (240.0, -5.0, 30.0, (0.0, 30.0)),       # negative start clamps to 0
    (240.0, 10.0, None, (10.0, None)),      # full cover from 10 s
])
def test_clamp_section(total, start, duration, expected):
    assert clamp_section(total, start, duration) == expected


def test_clamp_section_rejects_non_positive_duration():
    with pytest.raises(ValueError):
        clamp_section(100.0, 0.0, 0.0)


def test_run_generation_end_to_end_with_fakes(tone_wav, tmp_path):
    song = tone_wav("song.wav", seconds=3.0)
    request = GenerationRequest(input_path=song, voice_id="any", output_path=tmp_path / "out" / "cover.mp3",
                                start=1.0, duration=1.0)
    result = run_generation(request, CopySeparator(), PassthroughProvider(), device="cpu")
    assert result.output_path.exists()
    assert probe_duration(result.output_path) == pytest.approx(1.0, abs=0.15)
    m = result.metrics
    assert m.audio_duration_seconds == pytest.approx(1.0, abs=0.05)
    assert m.separator == "copy" and m.provider == "passthrough" and m.device == "cpu"
    assert m.total_seconds >= m.trim_seconds + m.separation_seconds + m.voice_conversion_seconds + m.mixing_seconds - 1e-6
    assert result.effective_start == 1.0
    assert result.work_dir is None  # temp dir was cleaned up


def test_run_generation_keeps_work_dir_when_asked(tone_wav, tmp_path):
    song = tone_wav("song.wav", seconds=2.0)
    work = tmp_path / "work"
    request = GenerationRequest(input_path=song, voice_id="any", output_path=tmp_path / "cover.mp3",
                                start=0.0, duration=1.0, work_dir=work, keep_work=True)
    result = run_generation(request, CopySeparator(), PassthroughProvider())
    assert result.work_dir == work
    assert (work / "trimmed.wav").exists()
    assert (work / "separated" / "copy" / "vocals.wav").exists()


def test_run_generation_missing_input(tmp_path):
    request = GenerationRequest(input_path=tmp_path / "nope.mp3", voice_id="any", output_path=tmp_path / "o.mp3")
    with pytest.raises(FileNotFoundError):
        run_generation(request, CopySeparator(), PassthroughProvider())
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/pipeline.py`:
```python
"""trim → separate → convert → mix. Owns the work directory and the stopwatch, nothing else."""
from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .audio import mix, probe_duration, trim
from .device import VramSampler, describe_gpu
from .metrics import GenerationMetrics, StageTimer
from .separation import Separator
from .voice_conversion import VoiceConversionProvider


@dataclass
class GenerationRequest:
    input_path: Path
    voice_id: str
    output_path: Path
    start: float = 30.0
    duration: float | None = 30.0  # None → until the end of the song (full cover)
    pitch_shift: int = 0
    work_dir: Path | None = None   # None → private temp dir, removed unless keep_work
    keep_work: bool = False


@dataclass
class GenerationResult:
    output_path: Path
    metrics: GenerationMetrics
    effective_start: float
    work_dir: Path | None


def clamp_section(total: float, start: float, duration: float | None) -> tuple[float, float | None]:
    """Fit the requested window inside the song instead of failing.

    Overflowing windows slide back; songs shorter than the window are used whole.
    """
    start = max(0.0, start)
    if duration is None:
        return (min(start, total), None)
    if duration <= 0:
        raise ValueError("duration must be positive (use None for the full song)")
    if total <= duration:
        return (0.0, total)
    return (min(start, total - duration), duration)


def run_generation(request: GenerationRequest, separator: Separator, provider: VoiceConversionProvider,
                   device: str = "cpu", vram_sampler: VramSampler | None = None) -> GenerationResult:
    if not request.input_path.is_file():
        raise FileNotFoundError(request.input_path)

    owns_work_dir = request.work_dir is None
    work_dir = Path(tempfile.mkdtemp(prefix="coverly-")) if owns_work_dir else request.work_dir
    work_dir.mkdir(parents=True, exist_ok=True)
    sampler = vram_sampler if vram_sampler is not None else VramSampler()
    timer = StageTimer()
    try:
        total = probe_duration(request.input_path)
        start, duration = clamp_section(total, request.start, request.duration)

        with timer.stage("trim"):  # PRD §16: trim BEFORE separation to save GPU seconds
            trimmed = trim(request.input_path, work_dir / "trimmed.wav", start, duration)
        section_seconds = probe_duration(trimmed)

        with sampler:
            with timer.stage("separation"):
                stems = separator.separate(trimmed, work_dir)
            with timer.stage("voice_conversion"):
                converted = provider.convert(stems.vocals, request.voice_id, work_dir, request.pitch_shift)

        with timer.stage("mixing"):
            request.output_path.parent.mkdir(parents=True, exist_ok=True)
            mix(converted, stems.instrumental, request.output_path)

        metrics = GenerationMetrics(
            audio_duration_seconds=section_seconds,
            trim_seconds=timer.stages["trim"],
            separation_seconds=timer.stages["separation"],
            voice_conversion_seconds=timer.stages["voice_conversion"],
            mixing_seconds=timer.stages["mixing"],
            total_seconds=timer.total(),
            device=device,
            gpu_name=describe_gpu(device),
            peak_vram_mb=sampler.peak_mb,
            separator=separator.name,
            provider=provider.name,
        )
        keep = request.keep_work or not owns_work_dir
        return GenerationResult(output_path=request.output_path, metrics=metrics,
                                effective_start=start, work_dir=work_dir if keep else None)
    finally:
        if owns_work_dir and not request.keep_work:
            shutil.rmtree(work_dir, ignore_errors=True)
```

- [x] **Step 4: Run** → 9 passed.

---

### Task 8: `generate.py` CLI

**Files:**
- Create: `apps/worker/coverly_worker/cli.py`, `apps/worker/generate.py`
- Test: `apps/worker/tests/test_cli.py`

**Interfaces:**
- Produces:
  - `add_component_args(parser)` adds `--provider {seedvc,passthrough}`, `--separator {demucs,copy}`, `--device {auto,cuda,mps,cpu}`, `--demucs-model`, `--diffusion-steps`, `--seedvc-dir` (env `SEED_VC_DIR`, default `vendor/seed-vc`), `--seedvc-python` (env `SEED_VC_PYTHON`), `--voices-dir` (default `voices`)
  - `build_components(args) -> tuple[Separator, VoiceConversionProvider, str]`
  - `main(argv: list[str] | None = None) -> int`
  - CLI flags: `--input --voice --start(30) --duration(30; 0 = full song) --output --pitch-shift(0) --keep-work --work-dir --metrics-json`

- [x] **Step 1: Failing tests**

`tests/test_cli.py`:
```python
import json

from coverly_worker.cli import main


def test_generate_cli_runs_with_fake_components(tone_wav, tmp_path, capsys):
    song = tone_wav("song.wav", seconds=3.0)
    out = tmp_path / "cover.mp3"
    metrics_json = tmp_path / "metrics.json"
    code = main(["--input", str(song), "--voice", "unused", "--start", "1", "--duration", "1",
                 "--output", str(out), "--separator", "copy", "--provider", "passthrough",
                 "--device", "cpu", "--metrics-json", str(metrics_json)])
    assert code == 0
    assert out.exists()
    printed = capsys.readouterr().out
    assert "Generation completed" in printed and "Total:" in printed
    data = json.loads(metrics_json.read_text())
    assert data["provider"] == "passthrough" and data["device"] == "cpu"
    assert data["audio_duration_seconds"] == 1.0 or abs(data["audio_duration_seconds"] - 1.0) < 0.05


def test_generate_cli_duration_zero_means_full_song(tone_wav, tmp_path):
    from coverly_worker.audio import probe_duration
    song = tone_wav("song.wav", seconds=2.0)
    out = tmp_path / "full.mp3"
    code = main(["--input", str(song), "--voice", "x", "--start", "0", "--duration", "0",
                 "--output", str(out), "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 0
    assert probe_duration(out) > 1.8


def test_generate_cli_reports_missing_input(tmp_path, capsys):
    code = main(["--input", str(tmp_path / "missing.mp3"), "--voice", "x", "--output", str(tmp_path / "o.mp3"),
                 "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 1
    assert "missing.mp3" in capsys.readouterr().err
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/cli.py`:
```python
"""`python generate.py` — one AI cover from the command line (PRD §54)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .audio import FfmpegError
from .device import detect_device
from .pipeline import GenerationRequest, run_generation
from .separation import CopySeparator, DemucsSeparator, SeparationError, Separator, SubprocessError
from .voice_conversion import (PassthroughProvider, SeedVCProvider, VoiceConversionError,
                               VoiceConversionProvider)

WORKER_ROOT = Path(__file__).resolve().parent.parent


def add_component_args(parser: argparse.ArgumentParser) -> None:
    g = parser.add_argument_group("models")
    g.add_argument("--provider", choices=["seedvc", "passthrough"], default="seedvc",
                   help="voice conversion backend (passthrough = no conversion, for plumbing tests)")
    g.add_argument("--separator", choices=["demucs", "copy"], default="demucs",
                   help="source separation backend (copy = no separation, for plumbing tests)")
    g.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    g.add_argument("--demucs-model", default="htdemucs")
    g.add_argument("--diffusion-steps", type=int, default=30, help="Seed-VC steps; 30-50 recommended for singing")
    g.add_argument("--seedvc-dir", type=Path, default=Path(os.environ.get("SEED_VC_DIR", WORKER_ROOT / "vendor" / "seed-vc")))
    g.add_argument("--seedvc-python", type=Path, default=(Path(os.environ["SEED_VC_PYTHON"]) if os.environ.get("SEED_VC_PYTHON") else None))
    g.add_argument("--voices-dir", type=Path, default=WORKER_ROOT / "voices")


def build_components(args: argparse.Namespace) -> tuple[Separator, VoiceConversionProvider, str]:
    device = detect_device(args.device)
    separator: Separator = CopySeparator() if args.separator == "copy" else DemucsSeparator(
        model=args.demucs_model, device=device)
    provider: VoiceConversionProvider = PassthroughProvider() if args.provider == "passthrough" else SeedVCProvider(
        repo_dir=args.seedvc_dir, python=args.seedvc_python, voices_dir=args.voices_dir,
        diffusion_steps=args.diffusion_steps, device=device)
    return separator, provider, device


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="generate.py", description="Generate one AI cover (trim → separate → convert → mix)")
    parser.add_argument("--input", required=True, type=Path, help="song file (mp3/wav/m4a)")
    parser.add_argument("--voice", required=True, help="reference vocal wav path, or a name under --voices-dir")
    parser.add_argument("--start", type=float, default=30.0, help="section start in seconds (default 30)")
    parser.add_argument("--duration", type=float, default=30.0, help="section length in seconds; 0 = to end of song")
    parser.add_argument("--output", required=True, type=Path, help="output mp3 path")
    parser.add_argument("--pitch-shift", type=int, default=0, help="semitones applied to the converted vocal")
    parser.add_argument("--keep-work", action="store_true", help="keep intermediate files")
    parser.add_argument("--work-dir", type=Path, default=None, help="where intermediates go (implies --keep-work)")
    parser.add_argument("--metrics-json", type=Path, default=None, help="also write metrics as JSON here")
    add_component_args(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    separator, provider, device = build_components(args)
    request = GenerationRequest(
        input_path=args.input, voice_id=args.voice, output_path=args.output,
        start=args.start, duration=None if args.duration <= 0 else args.duration,
        pitch_shift=args.pitch_shift, work_dir=args.work_dir, keep_work=args.keep_work or args.work_dir is not None,
    )
    try:
        result = run_generation(request, separator, provider, device=device)
    except (FileNotFoundError, FfmpegError, SeparationError, VoiceConversionError, SubprocessError) as exc:
        print(f"generation failed: {exc}", file=sys.stderr)
        return 1
    print(result.metrics.format_report())
    print(f"\nOutput: {result.output_path}")
    if result.work_dir:
        print(f"Work dir: {result.work_dir}")
    if args.metrics_json:
        args.metrics_json.parent.mkdir(parents=True, exist_ok=True)
        payload = {**result.metrics.to_dict(), "input": str(args.input), "voice": args.voice,
                   "effective_start": result.effective_start, "output": str(result.output_path)}
        args.metrics_json.write_text(json.dumps(payload, indent=2))
    return 0
```

`apps/worker/generate.py`:
```python
#!/usr/bin/env python
"""CLI entry point. See coverly_worker/cli.py."""
import sys

from coverly_worker.cli import main

if __name__ == "__main__":
    sys.exit(main())
```

- [x] **Step 4: Run** → 3 passed. Also smoke: `uv run python generate.py --help`.

---

### Task 9: `benchmark.py` — many samples, summary, cost

**Files:**
- Create: `apps/worker/coverly_worker/benchmark.py`, `apps/worker/benchmark.py`
- Test: `apps/worker/tests/test_benchmark.py`

**Interfaces:**
- Consumes: `cli.add_component_args/build_components`, `pipeline.run_generation`, `metrics.estimate_cost`
- Produces:
  - `@dataclass BenchmarkRow(input: str, output: str | None, ok: bool, error: str | None, metrics: dict | None)`
  - `summarize(rows: list[BenchmarkRow]) -> dict` with keys `n, ok, success_rate, stages: {name: {mean, median, min, max}}` for `trim_seconds, separation_seconds, voice_conversion_seconds, mixing_seconds, total_seconds`, plus `audio_duration_mean`, `peak_vram_mb_max`
  - `format_summary(summary: dict, cost: CostEstimate | None) -> str`
  - `main(argv) -> int`; flags: `--inputs PATH... --voice --start --duration --out-dir(bench_out) --repeat(1) --gpu(L4) --gpu-price-usd-per-sec --usd-krw(1400)` + component args. Writes `out-dir/results.json`, `results.csv`, `review_template.csv`, and one mp3 per run.

- [x] **Step 1: Failing tests**

`tests/test_benchmark.py`:
```python
import csv
import json

from coverly_worker.benchmark import BenchmarkRow, format_summary, main, summarize
from coverly_worker.metrics import estimate_cost


def _row(total, ok=True):
    m = None if not ok else dict(audio_duration_seconds=30.0, trim_seconds=1.0, separation_seconds=2.0,
                                 voice_conversion_seconds=3.0, mixing_seconds=1.0, total_seconds=total,
                                 device="cpu", gpu_name=None, peak_vram_mb=None, separator="copy", provider="passthrough")
    return BenchmarkRow(input="a.mp3", output="a.mp3" if ok else None, ok=ok, error=None if ok else "boom", metrics=m)


def test_summarize_aggregates_ok_rows_only():
    s = summarize([_row(10.0), _row(20.0), _row(0.0, ok=False)])
    assert s["n"] == 3 and s["ok"] == 2
    assert s["success_rate"] == 2 / 3
    assert s["stages"]["total_seconds"]["mean"] == 15.0
    assert s["stages"]["total_seconds"]["median"] == 15.0
    assert s["stages"]["total_seconds"]["min"] == 10.0
    assert s["stages"]["total_seconds"]["max"] == 20.0


def test_summarize_handles_no_successes():
    s = summarize([_row(0.0, ok=False)])
    assert s["ok"] == 0 and s["stages"] == {}


def test_format_summary_mentions_cost():
    s = summarize([_row(30.0)])
    text = format_summary(s, estimate_cost(30.0, gpu="L4", usd_krw=1400.0))
    assert "success 1/1" in text
    assert "L4" in text and "KRW" in text


def test_benchmark_main_writes_results(tone_wav, tmp_path):
    a = tone_wav("a.wav", seconds=2.0)
    b = tone_wav("b.wav", seconds=2.0, freq=330.0)
    out_dir = tmp_path / "bench"
    code = main(["--inputs", str(a), str(b), "--voice", "x", "--start", "0", "--duration", "1",
                 "--out-dir", str(out_dir), "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 0
    results = json.loads((out_dir / "results.json").read_text())
    assert len(results["rows"]) == 2 and results["summary"]["success_rate"] == 1.0
    assert results["cost"]["gpu"] == "L4"
    with (out_dir / "results.csv").open() as f:
        assert len(list(csv.DictReader(f))) == 2
    with (out_dir / "review_template.csv").open() as f:
        rows = list(csv.DictReader(f))
        assert rows[0]["usable"] == "" and len(rows) == 2
    assert len(list(out_dir.glob("*.mp3"))) == 2
```

- [x] **Step 2: Run** → ImportError.

- [x] **Step 3: Implement**

`coverly_worker/benchmark.py`:
```python
"""Run the pipeline over N samples, aggregate timings, estimate GPU cost (PRD §19-20, §54)."""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path

from .cli import add_component_args, build_components
from .metrics import GPU_PRICES_USD_PER_SECOND, CostEstimate, estimate_cost
from .pipeline import GenerationRequest, run_generation

STAGE_KEYS = ["trim_seconds", "separation_seconds", "voice_conversion_seconds", "mixing_seconds", "total_seconds"]


@dataclass
class BenchmarkRow:
    input: str
    output: str | None
    ok: bool
    error: str | None
    metrics: dict | None


def summarize(rows: list[BenchmarkRow]) -> dict:
    ok_rows = [r for r in rows if r.ok and r.metrics]
    summary: dict = {"n": len(rows), "ok": len(ok_rows), "success_rate": (len(ok_rows) / len(rows)) if rows else 0.0,
                     "stages": {}, "audio_duration_mean": None, "peak_vram_mb_max": None}
    if not ok_rows:
        return summary
    for key in STAGE_KEYS:
        values = [r.metrics[key] for r in ok_rows]
        summary["stages"][key] = {"mean": statistics.fmean(values), "median": statistics.median(values),
                                  "min": min(values), "max": max(values)}
    summary["audio_duration_mean"] = statistics.fmean(r.metrics["audio_duration_seconds"] for r in ok_rows)
    vram = [r.metrics["peak_vram_mb"] for r in ok_rows if r.metrics.get("peak_vram_mb") is not None]
    summary["peak_vram_mb_max"] = max(vram) if vram else None
    return summary


def format_summary(summary: dict, cost: CostEstimate | None) -> str:
    lines = [f"Benchmark: success {summary['ok']}/{summary['n']} ({summary['success_rate']:.0%})"]
    if summary["stages"]:
        lines.append(f"Audio per run: {summary['audio_duration_mean']:.1f} sec")
        lines.append(f"{'stage':<18}{'mean':>8}{'median':>8}{'min':>8}{'max':>8}")
        for key, s in summary["stages"].items():
            lines.append(f"{key.replace('_seconds', ''):<18}{s['mean']:>8.1f}{s['median']:>8.1f}{s['min']:>8.1f}{s['max']:>8.1f}")
        if summary["peak_vram_mb_max"] is not None:
            lines.append(f"Peak VRAM (max over runs): {summary['peak_vram_mb_max']:.0f} MB")
    if cost is not None:
        lines.append(f"Estimated cost per generation on {cost.gpu} @ {cost.billed_seconds:.1f} billed sec: "
                     f"${cost.usd:.4f} ≈ {cost.krw:.0f} KRW")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="benchmark.py", description="Benchmark the AI cover pipeline over several songs")
    parser.add_argument("--inputs", nargs="+", required=True, type=Path)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--start", type=float, default=30.0)
    parser.add_argument("--duration", type=float, default=30.0, help="0 = full song")
    parser.add_argument("--out-dir", type=Path, default=Path("bench_out"))
    parser.add_argument("--repeat", type=int, default=1, help="runs per input (use >1 to see warm-cache timings)")
    parser.add_argument("--gpu", default="L4", help=f"price row for the cost estimate: {', '.join(GPU_PRICES_USD_PER_SECOND)}")
    parser.add_argument("--gpu-price-usd-per-sec", type=float, default=None, help="override the price table")
    parser.add_argument("--usd-krw", type=float, default=1400.0)
    add_component_args(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    separator, provider, device = build_components(args)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    voice_tag = Path(args.voice).stem
    rows: list[BenchmarkRow] = []
    for input_path in args.inputs:
        for i in range(args.repeat):
            suffix = f"_r{i + 1}" if args.repeat > 1 else ""
            output = args.out_dir / f"{input_path.stem}__{voice_tag}{suffix}.mp3"
            request = GenerationRequest(input_path=input_path, voice_id=args.voice, output_path=output,
                                        start=args.start, duration=None if args.duration <= 0 else args.duration)
            print(f"[{len(rows) + 1}] {input_path.name} → {output.name} ...", flush=True)
            try:
                result = run_generation(request, separator, provider, device=device)
                rows.append(BenchmarkRow(str(input_path), str(output), True, None, result.metrics.to_dict()))
                print(f"    total {result.metrics.total_seconds:.1f}s "
                      f"(sep {result.metrics.separation_seconds:.1f}s, vc {result.metrics.voice_conversion_seconds:.1f}s)")
            except Exception as exc:  # noqa: BLE001 - a benchmark must record failures, not die
                rows.append(BenchmarkRow(str(input_path), None, False, f"{type(exc).__name__}: {exc}", None))
                print(f"    FAILED: {exc}", file=sys.stderr)
                traceback.print_exc()

    summary = summarize(rows)
    cost = None
    if summary["stages"]:
        cost = estimate_cost(summary["stages"]["total_seconds"]["mean"], gpu=args.gpu,
                             usd_per_second=args.gpu_price_usd_per_sec, usd_krw=args.usd_krw)
    (args.out_dir / "results.json").write_text(json.dumps(
        {"device": device, "separator": separator.name, "provider": provider.name,
         "rows": [asdict(r) for r in rows], "summary": summary, "cost": asdict(cost) if cost else None}, indent=2))
    with (args.out_dir / "results.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["input", "output", "ok", "error", *STAGE_KEYS, "audio_duration_seconds", "peak_vram_mb"])
        writer.writeheader()
        for r in rows:
            m = r.metrics or {}
            writer.writerow({"input": r.input, "output": r.output, "ok": r.ok, "error": r.error,
                             **{k: m.get(k) for k in [*STAGE_KEYS, "audio_duration_seconds", "peak_vram_mb"]}})
    with (args.out_dir / "review_template.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["output", "usable", "notes"])
        writer.writeheader()
        for r in rows:
            if r.output:
                writer.writerow({"output": Path(r.output).name, "usable": "", "notes": ""})
    print()
    print(format_summary(summary, cost))
    print(f"\nResults: {args.out_dir / 'results.json'}\nListen to the mp3s and fill in {args.out_dir / 'review_template.csv'} "
          "(PRD §48: ≥7/10 must be publishable).")
    return 0 if summary["ok"] == summary["n"] else 2
```

`apps/worker/benchmark.py`:
```python
#!/usr/bin/env python
"""CLI entry point. See coverly_worker/benchmark.py."""
import sys

from coverly_worker.benchmark import main

if __name__ == "__main__":
    sys.exit(main())
```

- [x] **Step 4: Run** → 4 passed; whole suite green: `uv run pytest -q`.

---

### Task 10: Seed-VC setup script and fixture generator

**Files:**
- Create: `apps/worker/scripts/setup_seedvc.sh`, `apps/worker/scripts/seedvc-requirements.txt`, `apps/worker/scripts/make_fixtures.sh`

**Interfaces:**
- Produces: `vendor/seed-vc/` checkout with `.venv/bin/python` (what `SeedVCProvider` defaults to); `samples/synthetic_song.wav` and `voices/demo_voice.wav` for a rights-free smoke test.

- [x] **Step 1: Pinned requirements for inference only**

`scripts/seedvc-requirements.txt` (Seed-VC's own file pins nightly torch and drags in gradio/funasr/modelscope which inference does not need):
```
torch==2.8.0
torchaudio==2.8.0
numpy==1.26.4
scipy==1.13.1
librosa==0.10.2
soundfile==0.12.1
transformers==4.46.3
huggingface-hub>=0.28.1,<1.0
munch==4.0.0
einops==0.8.0
descript-audio-codec==1.0.0
pyyaml
```

- [x] **Step 2: Setup script**

`scripts/setup_seedvc.sh`:
```bash
#!/usr/bin/env bash
# Clone Seed-VC into apps/worker/vendor/seed-vc and give it its own Python 3.11 venv.
# Idempotent: re-running updates nothing destructive.
set -euo pipefail
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$WORKER_DIR/vendor/seed-vc"
REPO_URL="${SEED_VC_REPO:-https://github.com/Plachtaa/seed-vc.git}"
PYTHON_VERSION="${SEED_VC_PYTHON_VERSION:-3.11}"

if [ ! -d "$VENDOR_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$VENDOR_DIR"
fi
cd "$VENDOR_DIR"
if [ ! -x .venv/bin/python ]; then
  uv venv --python "$PYTHON_VERSION" .venv
fi
uv pip install --python .venv/bin/python -r "$WORKER_DIR/scripts/seedvc-requirements.txt"
echo
echo "Seed-VC ready: $VENDOR_DIR (python: $VENDOR_DIR/.venv/bin/python)"
echo "Model checkpoints (~3 GB) download automatically on first run into $VENDOR_DIR/checkpoints"
```

- [x] **Step 3: Fixture generator (no copyrighted audio needed)**

`scripts/make_fixtures.sh`:
```bash
#!/usr/bin/env bash
# Build a rights-free smoke-test pair:
#   samples/synthetic_song.wav — 90 s: spoken "vocal" (macOS `say`) over a synthetic chord bed
#   voices/demo_voice.wav      — 15 s reference voice from a different macOS voice
# Real quality evaluation still needs real songs you have rights to (PRD §4).
set -euo pipefail
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$WORKER_DIR/samples" "$WORKER_DIR/voices" "$WORKER_DIR/work"
TMP="$WORKER_DIR/work/fixtures"; mkdir -p "$TMP"

if ! command -v say >/dev/null; then
  echo "macOS 'say' not available: put your own song in samples/ and a 10-25 s clean vocal in voices/." >&2
  exit 1
fi

LYRIC="Twinkle twinkle little star, how I wonder what you are. Up above the world so high, like a diamond in the sky."
say -v Samantha -r 150 -o "$TMP/vocal.aiff" "$LYRIC $LYRIC $LYRIC $LYRIC"
say -v Daniel -r 160 -o "$TMP/ref.aiff" "The quick brown fox jumps over the lazy dog. She sells sea shells by the sea shore. Peter Piper picked a peck of pickled peppers."

# chord bed: three detuned sines, 90 s, quiet
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=220:duration=90" -f lavfi -i "sine=frequency=277:duration=90" -f lavfi -i "sine=frequency=330:duration=90" \
  -filter_complex "[0:a][1:a][2:a]amix=inputs=3:normalize=0,volume=0.15,aformat=channel_layouts=stereo[bed]" -map "[bed]" -ar 44100 "$TMP/bed.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/vocal.aiff" -af "adelay=5000|5000,apad=whole_dur=90,aformat=channel_layouts=stereo" -ar 44100 "$TMP/vocal.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/vocal.wav" -i "$TMP/bed.wav" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:normalize=0" -ar 44100 -ac 2 "$WORKER_DIR/samples/synthetic_song.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/ref.aiff" -t 15 -ar 44100 -ac 1 "$WORKER_DIR/voices/demo_voice.wav"
echo "wrote samples/synthetic_song.wav and voices/demo_voice.wav"
```

- [x] **Step 4: Run both scripts**

```bash
cd apps/worker && chmod +x scripts/*.sh && ./scripts/make_fixtures.sh && ./scripts/setup_seedvc.sh
```
Expected: both files exist; `vendor/seed-vc/.venv/bin/python -c "import torch, transformers, librosa, dac"` succeeds.

- [x] **Step 5: First real end-to-end run**

```bash
uv run python generate.py --input samples/synthetic_song.wav --voice voices/demo_voice.wav \
  --start 5 --duration 30 --output work/first_cover.mp3 --keep-work --metrics-json work/first_metrics.json
```
Expected: PRD-format report, `work/first_cover.mp3` playable. If Seed-VC fails on MPS, retry with `--device cpu`. Record timings in `docs/phase0-report.md`.

---

### Task 11: Optional cloud GPU runner (Modal)

**Files:**
- Create: `apps/worker/modal_benchmark.py`

**Interfaces:**
- Consumes: `coverly_worker.pipeline.run_generation`, `DemucsSeparator`, `SeedVCProvider`
- Produces: `modal run modal_benchmark.py --inputs samples/*.mp3 --voice voices/x.wav [--gpu L4]` → per-run metrics JSON + mp3s under `bench_out/modal-<gpu>/`. Cannot be verified without a Modal account; marked as such in README.

- [x] **Step 1: Write the app**

```python
"""Run the same pipeline on a real cloud GPU to get the numbers PRD §54 asks for.

    pip install modal && modal setup
    COVERLY_GPU=L4 modal run modal_benchmark.py --inputs samples/a.mp3 samples/b.mp3 --voice voices/x.wav

Everything (demucs + seed-vc deps) is installed into ONE image python here; the local two-venv
split is only a convenience for laptops. Model weights are downloaded at image build time so the
measured time excludes downloads (cold start of the container is still reported separately).
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

import modal

GPU = os.environ.get("COVERLY_GPU", "L4")
SEED_VC_DIR = "/opt/seed-vc"
REQS = Path(__file__).parent / "scripts" / "seedvc-requirements.txt"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements(str(REQS))
    .pip_install("demucs==4.1.0")
    .run_commands(
        f"git clone --depth 1 https://github.com/Plachtaa/seed-vc.git {SEED_VC_DIR}",
        # warm caches: demucs weights + seed-vc checkpoints (whisper, DiT, BigVGAN, campplus, rmvpe)
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"",
        f"cd {SEED_VC_DIR} && python inference.py --source examples/source/source_s1.wav "
        f"--target examples/reference/s1p1.wav --output /tmp/warm --diffusion-steps 1 --f0-condition True --fp16 False",
    )
    .add_local_python_source("coverly_worker")
)

app = modal.App("coverly-phase0-benchmark", image=image)


@app.function(gpu=GPU, timeout=60 * 30)
def generate_remote(song: bytes, song_name: str, voice: bytes, start: float, duration: float,
                    diffusion_steps: int) -> dict:
    from coverly_worker.pipeline import GenerationRequest, run_generation
    from coverly_worker.separation import DemucsSeparator
    from coverly_worker.voice_conversion import SeedVCProvider

    work = Path("/tmp/job")
    work.mkdir(exist_ok=True)
    song_path = work / song_name
    song_path.write_bytes(song)
    voice_path = work / "voice.wav"
    voice_path.write_bytes(voice)
    out = work / "cover.mp3"
    started = time.time()
    result = run_generation(
        GenerationRequest(input_path=song_path, voice_id=str(voice_path), output_path=out,
                          start=start, duration=None if duration <= 0 else duration),
        DemucsSeparator(device="cuda", python=sys.executable),
        SeedVCProvider(repo_dir=Path(SEED_VC_DIR), python=Path(sys.executable), diffusion_steps=diffusion_steps, device="cuda"),
        device="cuda",
    )
    return {"metrics": result.metrics.to_dict(), "wall_seconds": time.time() - started, "mp3": out.read_bytes()}


@app.local_entrypoint()
def main(inputs: str, voice: str, start: float = 30.0, duration: float = 30.0, diffusion_steps: int = 30):
    """`inputs` is a comma-separated list of local song paths."""
    from coverly_worker.metrics import estimate_cost

    out_dir = Path("bench_out") / f"modal-{GPU}"
    out_dir.mkdir(parents=True, exist_ok=True)
    voice_bytes = Path(voice).read_bytes()
    rows = []
    for raw in inputs.split(","):
        song = Path(raw.strip())
        t0 = time.time()
        res = generate_remote.remote(song.read_bytes(), song.name, voice_bytes, start, duration, diffusion_steps)
        round_trip = time.time() - t0
        (out_dir / f"{song.stem}.mp3").write_bytes(res.pop("mp3"))
        res["round_trip_seconds"] = round_trip
        res["input"] = str(song)
        rows.append(res)
        print(f"{song.name}: total {res['metrics']['total_seconds']:.1f}s, round-trip {round_trip:.1f}s, "
              f"VRAM {res['metrics']['peak_vram_mb']} MB")
    mean_total = statistics.fmean(r["metrics"]["total_seconds"] for r in rows)
    cost = estimate_cost(mean_total, gpu=GPU)
    (out_dir / "results.json").write_text(json.dumps({"gpu": GPU, "rows": rows, "cost": cost.__dict__}, indent=2))
    print(f"\nmean total {mean_total:.1f}s on {GPU} → ${cost.usd:.4f} ≈ {cost.krw:.0f} KRW per generation")
```

- [x] **Step 2: Syntax check only** — `uv run python -c "import ast,sys; ast.parse(open('modal_benchmark.py').read())"`. Real run requires `pip install modal && modal setup` by the user.

---

### Task 12: Documentation and Phase 0 report

**Files:**
- Create: `apps/worker/README.md`, `docs/phase0-report.md`; update root `README.md`

- [x] **Step 1: Worker README** — sections: Prerequisites (ffmpeg, uv), Install (`uv sync`), Seed-VC setup (`scripts/setup_seedvc.sh`), Fixtures (`scripts/make_fixtures.sh`), Generate (exact PRD §54 command), Benchmark (`benchmark.py` flags, output files, the 7/10 listening test via `review_template.csv`), Cloud GPU benchmark (Modal, marked unverified), Architecture (interfaces to swap models), Tests (`uv run pytest`, integration marker), Troubleshooting (MPS fallback → `--device cpu`, first-run downloads).

- [x] **Step 2: Phase 0 report** — fill `docs/phase0-report.md` with: what works, what does not, VRAM requirement (public numbers for Demucs htdemucs ≈ 3 GB and Seed-VC 44k model ≈ 4–6 GB until measured), measured local timings from Task 10 Step 5, estimated cloud cost per 30 s generation for T4/L4/A10 (from `estimate_cost`), technical risks, recommended next phase.

- [x] **Step 3: Root README** — project summary, repo layout, phase checklist (Phase 0 ✅ pipeline/benchmark, ⏳ GPU benchmark on cloud, Phase 1+ not started), pointer to PRD and plan.

- [x] **Step 4: Final verification** — `cd apps/worker && uv run pytest -q` all green; `uv run python generate.py --help`; `uv run python benchmark.py --help`.

---

## Self-Review

- **Spec coverage:** §15 pipeline (Task 7), §16 trim-before-separate (Task 7 comment + order), §17 provider interface (Task 6), §19–20 metrics fields incl. GPU type/seconds/cost (Tasks 3, 4, 9), §33 intermediates cleanup (Task 7), §37 repo layout (Task 1), §48 Phase 0 + 10-sample test (Task 9 review template), §53 replaceable model/provider (Tasks 5, 6, 11), §54 CLI + report format + README (Tasks 8, 12). Not in scope by design: everything web/DB/auth/payment.
- **Placeholders:** none; every file has full content.
- **Type consistency:** `Runner` signature `(cmd, cwd=None, env=None)` used identically in Tasks 5, 6; `GenerationMetrics` field names identical in Tasks 3, 7, 9 (`STAGE_KEYS`); `add_component_args/build_components` defined in Task 8, consumed in Task 9; `SeedVCProvider(repo_dir, python, voices_dir, diffusion_steps, device)` constructor matches Tasks 6, 8, 11.
