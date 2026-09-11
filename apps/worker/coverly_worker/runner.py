"""Turns one queued job into a finished cover.

Everything the GPU worker does for a job lives here so it can be exercised locally without Modal:
fetch the source, run the pipeline, upload the result, record what it cost.
"""
from __future__ import annotations

import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from .audio import trim
from .backend import Backend, BackendError, Job
from .metrics import GPU_PRICES_USD_PER_SECOND, estimate_cost
from .pipeline import GenerationRequest, run_generation, split_shift
from .recording import analyse
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


# Uploads are named after whatever file or video they came from, so the useful part is buried in
# noise: "린(LYn) - ...사랑했잖아... [가사Lyrics]".
_NOISE = re.compile(r"[\[(][^\])]*[\])]|\b(mv|m/v|official|audio|lyrics?|가사|색깔가사|"
                    r"color coded|한글자막|4k|hd)\b", re.IGNORECASE)


def split_title(raw: str) -> tuple[str, str]:
    """(title, artist) from an upload's name, or ("", "") when it cannot be read.

    Only the "가수 - 제목" shape is accepted. Guessing at anything looser would fill the song
    table with junk that then gets recommended to people.
    """
    # Filenames from macOS are NFD: "거미" arrives as four code points and will not match the
    # composed form, so the same song quietly becomes two rows.
    cleaned = _NOISE.sub(" ", unicodedata.normalize("NFC", raw))
    cleaned = re.sub(r"\.(mp3|wav|m4a|flac|webm)$", " ", cleaned, flags=re.IGNORECASE)
    # "기억해줘요 내 모든 날과 그때를 호텔델루나 OST" is one song and one drama; only the first
    # half names the song, and leaving the rest on splits the same track into several rows.
    cleaned = re.sub(r"\s*\S+\s+OST\s*$", " ", cleaned, flags=re.IGNORECASE)
    parts = re.split(r"\s+[-–—]\s+", cleaned, maxsplit=1)
    if len(parts) != 2:
        return "", ""
    artist = re.sub(r"\s+", " ", parts[0]).strip(" .-_")
    title = re.sub(r"\s+", " ", parts[1]).strip(" .-_")
    if not artist or not title or len(artist) > 60 or len(title) > 120:
        return "", ""
    return title, artist


#: The model does not fall off a cliff above what it was trained on -- it is f0-conditioned, so
#: quality decays over a few semitones. Pulling a song down for one note just past the edge would
#: cost more than it saves.
CEILING_HEADROOM_SEMITONES = 2.0
#: How far below median alignment we will go to rescue the top notes. Past this the song simply
#: does not suit the voice, and dropping it further trades a strained peak for a whole cover that
#: sits too low to sound like anyone.
MAX_EXTRA_DROP_SEMITONES = 5.0


def auto_pitch_shift(vocal_path: Path, reference_path: Path, tolerance_semitones: float = 1.5,
                     max_semitones: int = 24, train_high: float = 0.0,
                     source_peak: float = 0.0) -> int:
    """Whole semitones to bring the song into the voice's register, or 0 when it already fits.

    This used to round to whole octaves, because shifting the vocal alone by anything else leaves
    it dissonant against an untransposed instrumental. That cost accuracy: a voice at 158 Hz
    covering a vocal at 429 Hz needs -17 semitones and got -12, leaving five semitones the model
    never learned. The pipeline now moves the instrumental too, so any interval is available --
    see `split_shift`.

    Aligning medians alone is not enough. A song with a wide range can sit perfectly on the median
    and still put its chorus well above anything the checkpoint has heard, which is where a cover
    stops sounding like the person. When the voice's ceiling is known the shift is pulled down far
    enough to bring the song's own peak under it, bounded so the rest of the song does not end up
    in a register the singer never uses.
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
    if train_high > 0 and source_peak > 0:
        ceiling = train_high * (2.0 ** (CEILING_HEADROOM_SEMITONES / 12.0))
        needed = 12 * float(np.log2(ceiling / source_peak))
        distance = max(min(distance, needed), distance - MAX_EXTRA_DROP_SEMITONES)
    if abs(distance) <= tolerance_semitones:
        return 0
    return int(round(max(-max_semitones, min(max_semitones, distance))))


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
    voice_train_high: float = 0.0,
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

            # One pyin pass over the separated vocal serves both the key decision and the song
            # table; running it twice on a two-minute track is not free.
            source_stats = analyse(stems.vocals)

            pitch_shift = job.pitch_shift
            if pitch_shift == 0 and reference_path and reference_path.is_file():
                pitch_shift = auto_pitch_shift(stems.vocals, reference_path,
                                               train_high=voice_train_high,
                                               source_peak=source_stats.f0_peak)

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
            metrics.update({
                "source_f0_low": round(source_stats.f0_low, 2) or None,
                "source_f0_median": round(source_stats.f0_median, 2) or None,
                "source_f0_high": round(source_stats.f0_high, 2) or None,
                "pitch_shift": pitch_shift,
            })
            price = GPU_PRICES_USD_PER_SECOND.get(gpu_type)
            cost = estimate_cost(metrics["total_seconds"], gpu=gpu_type,
                                 usd_per_second=price).usd if price else 0.0
            try:
                backend.record_metrics(job.cover_id, metrics, gpu_type, cost)
            except BackendError:
                # Losing a cost row must not lose the user their cover.
                pass

            try:
                title, artist = split_title(job.title or "")
                if artist:
                    backend.record_song_range(title, artist, source_stats.f0_low,
                                              source_stats.f0_median, source_stats.f0_high,
                                              source_stats.f0_peak)
            except (BackendError, Exception):  # noqa: B014 - same reason as the metrics row
                pass

            backend.complete(job, result_path)
            return result_path
        except Exception as exc:  # noqa: BLE001 - every failure must reach the user's screen
            backend.fail(job, f"{type(exc).__name__}: {exc}")
            raise
