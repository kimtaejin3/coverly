"""trim → separate → convert → mix. Owns the work directory and the stopwatch, nothing else."""
from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .audio import mix, probe_duration, transpose, trim
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


def split_shift(semitones: int) -> tuple[int, int]:
    """Split a shift into what the vocal takes and what the instrumental must follow.

    Octaves are consonant, so the vocal can take those alone and the backing need not move. Only
    the leftover -6..+6 has to be applied to both to keep the song in key -- which also keeps the
    instrumental's time-stretching to the smallest interval that does the job, since rubberband
    audibly smears a whole mix well before an octave.
    """
    octaves = round(semitones / 12) * 12
    return semitones, semitones - octaves


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
            # The vocal was converted at the shifted pitch; the instrumental has to follow it by
            # everything except the octaves, or the two end up in different keys.
            _, backing_shift = split_shift(request.pitch_shift)
            instrumental = stems.instrumental
            if backing_shift:
                instrumental = transpose(
                    instrumental, work_dir / "instrumental_shifted.wav", backing_shift
                )
            mix(converted, instrumental, request.output_path)

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
