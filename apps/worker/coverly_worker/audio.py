"""Thin wrappers around the ffmpeg/ffprobe binaries. No audio DSP happens in Python."""
from __future__ import annotations

import re
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


def measure_loudness(path: Path) -> float | None:
    """Integrated loudness in LUFS, or None when ffmpeg cannot measure it.

    Peak level says nothing about how loud something sounds. A dense instrumental peaking at -4
    is perceptually far louder than a vocal peaking at 0, which is how the vocal ended up buried
    when the gains were set from peaks.
    """
    result = subprocess.run(
        [_binary("ffmpeg"), "-hide_banner", "-nostats", "-i", str(path),
         "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
        capture_output=True, text=True, check=False,
    )
    match = re.findall(r"I:\s+(-?\d+(?:\.\d+)?)\s+LUFS", result.stderr)
    if not match:
        return None
    value = float(match[-1])
    # ffmpeg reports -70 or lower for silence; treat that as unmeasurable rather than as a level.
    return value if value > -70.0 else None


# How far the lead vocal sits above the instrumental, in LU. A pop lead sits clearly on top of
# the backing rather than level with it.
VOCAL_LEAD_LU = 4.0


def mix(vocals_path: Path, instrumental_path: Path, output_path: Path,
        vocal_gain_db: float | None = None, instrumental_gain_db: float = 0.0,
        bitrate: str = "192k", reverb: bool = True, vocal_lead_lu: float = VOCAL_LEAD_LU) -> Path:
    """Sum converted vocals over the instrumental and encode to MP3.

    The vocal gain is measured, not assumed. Demucs hands back stems at whatever level the source
    had, and Seed-VC's output level varies with the reference, so any fixed number is wrong for
    most songs. Both stems are measured in LUFS and the vocal is placed `vocal_lead_lu` above the
    instrumental; pass `vocal_gain_db` to override.

    The instrumental keeps the room the original was recorded in while the converted vocal is bone
    dry, so a short stereo reverb, mixed low, puts the voice in the same space. `aecho` is used
    rather than a convolution reverb so no impulse response has to ship with the worker.

    amix with normalize=0 keeps both stems at their own level; a limiter catches the peaks.
    duration=longest so a slightly shorter converted vocal never truncates the instrumental.
    """
    if vocal_gain_db is None:
        vocal_lufs = measure_loudness(vocals_path)
        instrumental_lufs = measure_loudness(instrumental_path)
        if vocal_lufs is None or instrumental_lufs is None:
            # Better to sit slightly forward than to disappear, which is what -3.5 dB did.
            vocal_gain_db = 1.0
        else:
            # Clamped: a mis-measured stem should not blow the mix apart in either direction.
            delta = max(-12.0, min(18.0,
                                   instrumental_lufs + vocal_lead_lu - vocal_lufs))
            # Split the correction between lifting the vocal and ducking the instrumental. Putting
            # it all on the vocal preserves the same balance but drives the sum into the limiter,
            # which pumps; sharing it keeps the mix at roughly the level it already had.
            vocal_gain_db = delta / 2.0
            instrumental_gain_db -= delta / 2.0

    vocal_chain = f"aresample=44100,aformat=channel_layouts=stereo,volume={vocal_gain_db}dB"
    if reverb:
        # Short pre-delays at low gain read as room, not as an echo effect.
        # Wetter than this and the reverb pushes the voice back behind the instrumental again.
        vocal_chain += ",aecho=0.9:0.85:38|63|97:0.16|0.11|0.07"
    filter_graph = (
        f"[0:a]{vocal_chain}[v];"
        f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={instrumental_gain_db}dB[i];"
        "[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false"
    )
    cmd = [_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
           "-i", str(vocals_path), "-i", str(instrumental_path),
           "-filter_complex", filter_graph, "-c:a", "libmp3lame", "-b:a", bitrate, str(output_path)]
    _run(cmd)
    return output_path
