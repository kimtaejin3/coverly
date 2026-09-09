"""Turn any song into a clean reference voice clip.

Seed-VC copies timbre from a reference recording, and the quality of that reference dominates the
result: it wants SINGING (not speech), dry (no backing track, little reverb), one person, and
10-25 seconds — the model ignores anything past 25 s.

This isolates the vocal with Demucs, then picks the most continuously-sung window rather than the
loudest one, because a window that is half silence gives the model far less timbre to copy.

Pitch range matters as much as density. The model only learns how the voice sounds at the pitches
the reference actually demonstrates, so a reference an octave above the song being covered produces
a convincing high register and a broken low one. `--match <song>` measures the target song's vocal
range and picks the window that sits in the same range.

    python make_voice.py --input iu.mp3 --name iu --match bss.mp3
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import wave
from array import array
from pathlib import Path

import numpy as np

from .audio import _binary, probe_duration, trim
from .device import detect_device
from .separation import DemucsSeparator

WORKER_ROOT = Path(__file__).resolve().parent.parent


def _rms_per_second(wav_path: Path) -> list[float]:
    """Coarse loudness envelope, one value per second, from a PCM16 wav."""
    with wave.open(str(wav_path), "rb") as w:
        rate, channels, frames = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = w.readframes(frames)
    samples = array("h")
    samples.frombytes(raw)
    step = rate * channels
    out = []
    for start in range(0, len(samples) - step + 1, step):
        chunk = samples[start:start + step]
        out.append((sum(float(s) * s for s in chunk) / len(chunk)) ** 0.5)
    return out


def f0_per_second(wav_path: Path) -> list[float]:
    """Median pitch of each second, or 0.0 where the second is unvoiced."""
    import librosa

    y, sr = librosa.load(str(wav_path), sr=16000)
    f0 = librosa.yin(y, fmin=70, fmax=900, sr=sr, frame_length=1024)
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    gate = float(np.max(rms)) * 0.08 if len(rms) else 0.0
    n = min(len(f0), len(rms))
    f0, rms = f0[:n], rms[:n]
    per_sec = max(1, int(round(sr / 256)))
    out = []
    for start in range(0, n - per_sec + 1, per_sec):
        chunk, level = f0[start:start + per_sec], rms[start:start + per_sec]
        voiced = chunk[level > gate]
        out.append(float(np.median(voiced)) if len(voiced) else 0.0)
    return out


def median_f0(wav_path: Path) -> float:
    """Median singing pitch of a vocal track, ignoring silence."""
    voiced = [v for v in f0_per_second(wav_path) if v > 0]
    return float(np.median(voiced)) if voiced else 0.0


def pick_window(levels: list[float], window: int, pitches: list[float] | None = None,
                target_f0: float = 0.0) -> tuple[int, float]:
    """Best `window`-second slice.

    Base score is how many seconds contain actual singing, since a window that is half silence
    gives the model little timbre to copy. When a target pitch is supplied, windows are penalised
    one point per semitone away from it: a reference outside the song's range leaves the model
    guessing exactly where the singer spends most of their time.
    """
    if len(levels) <= window:
        return 0, 0.0
    peak = max(levels) or 1.0
    threshold = peak * 0.12
    best_start, best_score = 0, float("-inf")
    for start in range(len(levels) - window + 1):
        slice_ = levels[start:start + window]
        voiced = sum(1 for v in slice_ if v > threshold)
        score = voiced + (sum(slice_) / len(slice_)) / peak
        if target_f0 > 0 and pitches:
            sung = [p for p in pitches[start:start + window] if p > 0]
            if not sung:
                continue
            semitones = abs(12 * np.log2(float(np.median(sung)) / target_f0))
            score -= semitones
        if score > best_score:
            best_start, best_score = start, score
    return best_start, best_score


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="make_voice.py", description="Extract a clean singing reference from a song")
    parser.add_argument("--input", required=True, type=Path, help="song containing the voice you want")
    parser.add_argument("--name", required=True, help="voice id; written to voices/<name>.wav")
    parser.add_argument("--duration", type=int, default=20, help="reference length, 10-25 s (default 20)")
    parser.add_argument("--start", type=float, default=None,
                        help="force a start time instead of auto-picking the best window")
    parser.add_argument("--match", type=Path, default=None,
                        help="song you intend to cover; picks the window matching its vocal range")
    parser.add_argument("--target-f0", type=float, default=0.0,
                        help="target median pitch in Hz (alternative to --match)")
    parser.add_argument("--voices-dir", type=Path, default=WORKER_ROOT / "voices")
    parser.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    parser.add_argument("--keep-vocal", action="store_true", help="also keep the full isolated vocal")
    parser.add_argument("--dataset", action="store_true",
                        help="also write fine-tuning clips to datasets/<name>/ (1-30 s each)")
    parser.add_argument("--clip-seconds", type=int, default=15,
                        help="length of each fine-tuning clip (default 15)")
    args = parser.parse_args(argv)

    if not args.input.is_file():
        print(f"no such file: {args.input}", file=sys.stderr)
        return 1
    duration = max(5, min(25, args.duration))
    device = detect_device(args.device)
    args.voices_dir.mkdir(parents=True, exist_ok=True)
    out_path = args.voices_dir / f"{args.name}.wav"

    with tempfile.TemporaryDirectory(prefix="coverly-voice-") as tmp:
        work = Path(tmp)
        song_seconds = probe_duration(args.input)
        print(f"input: {args.input.name} ({song_seconds:.0f}s) → isolating vocal on {device} ...")
        # Separating the whole song is fine here: this runs once per voice, not per generation.
        separator = DemucsSeparator(device=device)
        source = trim(args.input, work / "full.wav", 0.0, None)
        stems = separator.separate(source, work)

        target_f0 = args.target_f0
        if args.match is not None:
            if not args.match.is_file():
                print(f"no such file: {args.match}", file=sys.stderr)
                return 1
            print(f"measuring vocal range of {args.match.name} ...")
            match_dir = work / "match"
            match_dir.mkdir()
            match_src = trim(args.match, match_dir / "full.wav", 0.0, None)
            target_f0 = median_f0(separator.separate(match_src, match_dir).vocals)
            print(f"  target median pitch: {target_f0:.0f} Hz")

        if args.start is not None:
            start = args.start
            print(f"using forced start {start:.0f}s")
        else:
            levels = _rms_per_second(stems.vocals)
            pitches = f0_per_second(stems.vocals) if target_f0 > 0 else None
            start_sec, _ = pick_window(levels, duration, pitches, target_f0)
            start = float(start_sec)
            voiced = sum(1 for v in levels[start_sec:start_sec + duration]
                         if v > (max(levels) or 1.0) * 0.12)
            note = ""
            if pitches:
                sung = [p for p in pitches[start_sec:start_sec + duration] if p > 0]
                if sung:
                    note = f", median {np.median(sung):.0f} Hz vs target {target_f0:.0f} Hz"
            print(f"best window: {start:.0f}s-{start + duration:.0f}s "
                  f"({voiced}/{duration}s singing{note})")
            if voiced < duration * 0.6:
                print("  warning: this song has sparse vocals; pass --start to choose by ear",
                      file=sys.stderr)

        clip = trim(stems.vocals, work / "clip.wav", start, float(duration), channels=1)
        # Normalise so every voice reaches the model at a comparable level.
        subprocess.run([_binary("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
                        "-i", str(clip), "-af", "loudnorm=I=-18:TP=-2:LRA=11",
                        "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", str(out_path)], check=True)
        if args.dataset:
            dataset_dir = WORKER_ROOT / "datasets" / args.name
            dataset_dir.mkdir(parents=True, exist_ok=True)
            for old in dataset_dir.glob("*.wav"):
                old.unlink()
            levels_all = _rms_per_second(stems.vocals)
            gate = (max(levels_all) or 1.0) * 0.12
            vocal_seconds = probe_duration(stems.vocals)
            clip_len = max(1, min(30, args.clip_seconds))
            written = 0
            for begin in range(0, int(vocal_seconds) - clip_len + 1, clip_len):
                # Seed-VC ignores clips outside 1-30 s and learns nothing from silence, so keep
                # only clips that are mostly sung.
                sung = sum(1 for v in levels_all[begin:begin + clip_len] if v > gate)
                if sung < clip_len * 0.6:
                    continue
                written += 1
                clip_path = dataset_dir / f"{args.name}_{written:03d}.wav"
                trim(stems.vocals, clip_path, float(begin), float(clip_len), channels=1)
            print(f"dataset: {dataset_dir} ({written} clips x {clip_len}s)")

        if args.keep_vocal:
            full = args.voices_dir / f"{args.name}_full_vocal.wav"
            full.write_bytes(stems.vocals.read_bytes())
            print(f"full vocal: {full}")

    print(f"\nreference voice: {out_path} ({duration}s)")
    print(f"use it with:  uv run python generate.py --input <song> --voice {args.name} "
          f"--start 30 --duration 30 --output cover.mp3")
    return 0
