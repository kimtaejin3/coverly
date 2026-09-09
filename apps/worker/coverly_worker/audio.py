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
        vocal_gain_db: float = -3.5, instrumental_gain_db: float = 0.0, bitrate: str = "192k",
        reverb: bool = True) -> Path:
    """Sum converted vocals over the instrumental and encode to MP3.

    Two things stop the result sounding pasted on:

    * The converted vocal comes out of the vocoder hot — measured at 0.0 dB peak against an
      instrumental sitting near -4 — so it lands in front of the track instead of in it. It is
      pulled back by default.
    * The instrumental keeps the room the original was recorded in; the converted vocal is bone
      dry. A short stereo reverb, mixed low, puts the voice in the same space. `aecho` is used
      rather than a convolution reverb so no impulse response has to ship with the worker.

    amix with normalize=0 keeps both stems at their own level; a limiter catches the peaks.
    duration=longest so a slightly shorter converted vocal never truncates the instrumental.
    """
    vocal_chain = f"aresample=44100,aformat=channel_layouts=stereo,volume={vocal_gain_db}dB"
    if reverb:
        # Short pre-delays at low gain read as room, not as an echo effect.
        vocal_chain += ",aecho=0.85:0.85:38|63|97:0.22|0.15|0.09"
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
