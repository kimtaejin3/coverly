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
