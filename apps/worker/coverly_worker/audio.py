"""Thin wrappers around the ffmpeg/ffprobe binaries. No audio DSP happens in Python."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
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

# Where the finished mix lands. Without a target the loudness of a cover follows whatever the
# source happened to be, so two covers in a row jump in level.
TARGET_LUFS = -14.0

# The converted vocal arrives with no processing at all: vocoder output, dry, and as uneven as the
# singer was. Raising its average level alone leaves the quiet phrases buried, which is a dynamics
# problem rather than a gain one.
VOCAL_SHAPING = (
    "highpass=f=90,"                          # rumble and vocoder grit below the voice
    "equalizer=f=260:t=q:w=1.0:g=-2,"         # unmask the instrumental's low mids
    "equalizer=f=3200:t=q:w=1.4:g=2.5,"       # presence: where consonants live
    "deesser=i=0.35,"                         # that lift also sharpens sibilance
    "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150:makeup=2"
)


def transpose(input_path: Path, output_path: Path, semitones: float) -> Path:
    """Shift pitch without touching tempo.

    rubberband rather than asetrate: resampling changes the speed with the pitch, which turns a
    transposed instrumental into a different arrangement.
    """
    if abs(semitones) < 0.01:
        shutil.copyfile(input_path, output_path)
        return output_path
    scale = 2.0 ** (semitones / 12.0)
    _run([_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-i", str(input_path),
          "-af", f"rubberband=pitch={scale:.6f}:pitchq=quality:channels=together",
          str(output_path)])
    return output_path


def mix(vocals_path: Path, instrumental_path: Path, output_path: Path,
        vocal_gain_db: float | None = None, instrumental_gain_db: float = 0.0,
        bitrate: str = "192k", reverb: bool = True, vocal_lead_lu: float = VOCAL_LEAD_LU,
        target_lufs: float | None = TARGET_LUFS, shape_vocal: bool = True) -> Path:
    """Sum converted vocals over the instrumental and encode to MP3.

    Three passes, because each one needs the result of the last:

    1. Shape the vocal (EQ, de-ess, compression). Doing this first means the loudness measured in
       step 2 is the loudness that actually reaches the mix.
    2. Measure both stems and place the vocal `vocal_lead_lu` above the instrumental. Demucs hands
       back stems at whatever level the source had and Seed-VC's output level follows its
       reference, so any fixed gain is wrong for most songs.
    3. Measure the sum and correct it onto `target_lufs` before encoding.

    The instrumental keeps the room the original was recorded in while the converted vocal is bone
    dry, so a short stereo reverb, mixed low, puts the voice in the same space. `aecho` is used
    rather than a convolution reverb so no impulse response has to ship with the worker.
    """
    with tempfile.TemporaryDirectory(prefix="coverly-mix-") as tmp:
        work = Path(tmp)

        shaped = vocals_path
        if shape_vocal:
            shaped = work / "vocal_shaped.wav"
            _run([_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
                  "-i", str(vocals_path), "-af", VOCAL_SHAPING, str(shaped)])

        if vocal_gain_db is None:
            vocal_lufs = measure_loudness(shaped)
            instrumental_lufs = measure_loudness(instrumental_path)
            if vocal_lufs is None or instrumental_lufs is None:
                # Better to sit slightly forward than to disappear, which is what -3.5 dB did.
                vocal_gain_db = 1.0
            else:
                # Clamped: a mis-measured stem should not blow the mix apart in either direction.
                delta = max(-12.0, min(18.0, instrumental_lufs + vocal_lead_lu - vocal_lufs))
                # Split the correction between lifting the vocal and ducking the instrumental.
                # Putting it all on the vocal preserves the same balance but drives the sum into
                # the limiter, which pumps; sharing it keeps the mix near the level it had.
                vocal_gain_db = delta / 2.0
                instrumental_gain_db -= delta / 2.0

        vocal_chain = f"aresample=44100,aformat=channel_layouts=stereo,volume={vocal_gain_db}dB"
        if reverb:
            # Wetter than this and the reverb pushes the voice back behind the instrumental again.
            vocal_chain += ",aecho=0.9:0.85:38|63|97:0.16|0.11|0.07"
        filter_graph = (
            f"[0:a]{vocal_chain}[v];"
            f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={instrumental_gain_db}dB[i];"
            "[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false"
        )
        summed = work / "mix.wav"
        _run([_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
              "-i", str(shaped), "-i", str(instrumental_path),
              "-filter_complex", filter_graph, str(summed)])

        makeup = 0.0
        if target_lufs is not None:
            mixed_lufs = measure_loudness(summed)
            if mixed_lufs is not None:
                makeup = max(-12.0, min(12.0, target_lufs - mixed_lufs))

        cmd = [_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-i", str(summed)]
        if abs(makeup) > 0.1:
            cmd += ["-af", f"volume={makeup:.2f}dB,alimiter=limit=0.97:level=false"]
        cmd += ["-c:a", "libmp3lame", "-b:a", bitrate, str(output_path)]
        _run(cmd)
    return output_path


