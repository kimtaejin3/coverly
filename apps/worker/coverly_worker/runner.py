"""Turns one queued job into a finished cover.

Everything the GPU worker does for a job lives here so it can be exercised locally without Modal:
fetch the source, run the pipeline, upload the result, record what it cost.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from .audio import trim
from .backend import Backend, BackendError, Job
from .metrics import GPU_PRICES_USD_PER_SECOND, estimate_cost
from .pipeline import GenerationRequest, run_generation
from .separation import Separator
from .voice_conversion import VoiceConversionProvider


class SourceError(RuntimeError):
    """The job's audio could not be obtained; the job cannot proceed."""


def fetch_source(job: Job, backend: Backend, work_dir: Path) -> Path:
    """Get the job's audio, whichever way it arrived.

    YouTube retrieval happens here and nowhere else — the web tier only ever stores the URL, so
    this function is the single place that would need to change if that path is switched off.
    """
    # A YouTube job whose audio was already fetched for the preview carries the object path; use
    # it rather than downloading the same video a second time.
    if job.source_type == "youtube" and not job.original_file_url:
        if not job.source_url:
            raise SourceError("no source_url on a youtube job")
        return _download_youtube(job.source_url, work_dir)

    if not job.original_file_url:
        raise SourceError("no uploaded file recorded for this cover")
    suffix = Path(job.original_file_url).suffix or ".mp3"
    return backend.download("uploads", job.original_file_url, work_dir / f"source{suffix}")


def _download_youtube(url: str, work_dir: Path) -> Path:
    out = work_dir / "source.%(ext)s"
    proc = subprocess.run(
        [
            "yt-dlp",
            "--no-playlist",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            # A preview needs one section, not a two-hour upload; refuse the pathological cases.
            "--match-filter", "duration < 1800",
            "-o", str(out),
            url,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        stderr = proc.stderr or ""
        # YouTube blocks datacenter IPs and asks the caller to prove they are not a bot. There is
        # no fix on our side that is not a circumvention of that check, so this surfaces as a
        # plain "use a file instead" rather than a retry loop or a raw yt-dlp dump.
        if "not a bot" in stderr or "Sign in to confirm" in stderr:
            raise SourceError(
                "YouTube가 이 요청을 차단했습니다. 파일을 직접 올려주세요."
            )
        if "Private video" in stderr or "unavailable" in stderr.lower():
            raise SourceError("영상을 재생할 수 없습니다. 공개된 영상인지 확인해 주세요.")
        if "age" in stderr.lower() and "restrict" in stderr.lower():
            raise SourceError("연령 제한 영상은 가져올 수 없습니다.")
        raise SourceError(f"영상을 가져오지 못했습니다: {stderr[-200:]}")
    produced = sorted(work_dir.glob("source.*"))
    if not produced:
        raise SourceError("yt-dlp produced no audio (video may be unavailable or too long)")
    return produced[0]


def auto_pitch_shift(vocal_path: Path, reference_path: Path, tolerance_semitones: float = 3.5) -> int:
    """Octaves of shift to bring the song into the voice's register, or 0 when it already fits.

    Only whole octaves: any other interval turns the melody dissonant against an instrumental
    that was not transposed with it.
    """
    try:
        import numpy as np

        from .make_voice import median_f0
    except ImportError:
        return 0

    source = median_f0(vocal_path)
    target = median_f0(reference_path)
    if source <= 0 or target <= 0:
        return 0

    distance = 12 * float(np.log2(target / source))
    if abs(distance) <= tolerance_semitones:
        return 0
    # Round to the nearest octave, and never move more than one.
    octaves = max(-1, min(1, round(distance / 12)))
    return int(octaves * 12)


def process_job(
    job: Job,
    backend: Backend,
    separator: Separator,
    provider: VoiceConversionProvider,
    *,
    worker_id: str,
    device: str = "cuda",
    gpu_type: str = "L4",
    reference_path: Path | None = None,
) -> str:
    """Run one job to completion. Returns the storage path of the finished cover.

    Any failure marks the job failed and refunds a paid credit before re-raising, so a crash
    never leaves a user staring at a job that will never move.
    """
    backend.mark_processing(job, worker_id)

    with tempfile.TemporaryDirectory(prefix=f"coverly-{job.cover_id[:8]}-") as tmp:
        work = Path(tmp)
        try:
            source = fetch_source(job, backend, work)

            # Separate first so the pitch decision is made on the vocal alone; measuring the full
            # mix would read the bass line, not the singer.
            trimmed = trim(source, work / "trimmed.wav", job.start_seconds,
                           None if job.duration_seconds <= 0 else job.duration_seconds)
            stems = separator.separate(trimmed, work / "pre")

            pitch_shift = job.pitch_shift
            if pitch_shift == 0 and reference_path and reference_path.is_file():
                pitch_shift = auto_pitch_shift(stems.vocals, reference_path)

            result = run_generation(
                GenerationRequest(
                    input_path=source,
                    voice_id=job.voice_id,
                    output_path=work / "cover.mp3",
                    start=job.start_seconds,
                    duration=None if job.duration_seconds <= 0 else job.duration_seconds,
                    pitch_shift=pitch_shift,
                    work_dir=work / "wd",
                    keep_work=True,
                ),
                separator,
                provider,
                device=device,
            )

            result_path = f"{job.user_id}/{job.cover_id}.mp3"
            backend.upload("covers", result_path, result.output_path)

            metrics = result.metrics.to_dict()
            price = GPU_PRICES_USD_PER_SECOND.get(gpu_type)
            cost = estimate_cost(metrics["total_seconds"], gpu=gpu_type,
                                 usd_per_second=price).usd if price else 0.0
            try:
                backend.record_metrics(job.cover_id, metrics, gpu_type, cost)
            except BackendError:
                # Losing a cost row must not lose the user their cover.
                pass

            backend.complete(job, result_path)
            return result_path
        except Exception as exc:  # noqa: BLE001 - every failure must reach the user's screen
            backend.fail(job, f"{type(exc).__name__}: {exc}")
            raise
