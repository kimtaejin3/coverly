"""Choosing which VocalSet takes become a voice.

The first version sorted every usable take by length and filled a ten-minute budget from the top.
VocalSet's excerpts run 20-30 s while its scales and arpeggios run 5-10 s, so the budget was always
exhausted by excerpts before a single scale was reached -- and every one of the six catalogue
voices ended up built from the same Italian art song, sung on vowels, in one comfortable octave.

Range is the failure that actually matters. Seed-VC preserves the source pitch exactly, so a model
that only ever heard one octave falls apart the moment a song leaves it. Scales and arpeggios are
the takes that sweep a singer's whole range, which is why they get the largest share here.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Share of the training budget per singing context. Scales and arpeggios dominate because they are
# the only takes that traverse the range; excerpts still earn a slice because they are the only
# connected, consonant-bearing singing in the set.
QUOTAS: dict[str, float] = {
    "scales": 0.35,
    "arpeggios": 0.30,
    "long_tones": 0.20,
    "excerpts": 0.15,
}

# Deliberately strange noises. A voice model trained on them learns the noise.
AVOID = ("vocal_fry", "lip_trill", "trill", "trillo", "inhaled", "spoken", "breathy")

CONTEXTS = tuple(QUOTAS)


@dataclass
class Take:
    path: Path
    context: str
    duration: float
    f0_low: float = 0.0
    f0_high: float = 0.0
    f0_median: float = 0.0


def classify(path: Path) -> str | None:
    """VocalSet nests takes as <singer>/<context>/<technique>/<file>.wav."""
    name = "/".join(p.lower() for p in path.parts[-4:])
    if any(bad in name for bad in AVOID):
        return None
    for context in CONTEXTS:
        if context in name:
            return context
    # "long tones" appears with a space or hyphen in some copies of the archive.
    if "long" in name:
        return "long_tones"
    return None


def measure(path: Path, sr: int = 16000) -> tuple[float, float, float]:
    """10th, 50th and 90th percentile of the voiced f0, in Hz."""
    import librosa

    y, _ = librosa.load(path, sr=sr, mono=True)
    if y.size < sr // 2:
        return (0.0, 0.0, 0.0)
    f0 = librosa.yin(y, fmin=65, fmax=1200, sr=sr, frame_length=1024)
    voiced = f0[np.isfinite(f0) & (f0 > 70) & (f0 < 1100)]
    if voiced.size < 10:
        return (0.0, 0.0, 0.0)
    return tuple(float(v) for v in np.percentile(voiced, [10, 50, 90]))  # type: ignore[return-value]


def semitones(low: float, high: float) -> float:
    if low <= 0 or high <= 0:
        return 0.0
    return 12.0 * float(np.log2(high / low))


def pick_takes(singer_dir: Path, budget_seconds: float, probe) -> list[Take]:
    """Fill each context's quota with its longest takes, then spend any slack on what is left."""
    by_context: dict[str, list[Take]] = {c: [] for c in CONTEXTS}
    for wav in sorted(singer_dir.rglob("*.wav")):
        context = classify(wav)
        if context is None:
            continue
        try:
            duration = probe(wav)
        except Exception:  # noqa: BLE001 - a broken file is simply skipped
            continue
        if duration >= 2.0:
            by_context[context].append(Take(wav, context, duration))

    for takes in by_context.values():
        takes.sort(key=lambda t: -t.duration)

    chosen: list[Take] = []
    leftovers: list[Take] = []
    for context, share in QUOTAS.items():
        allowance = budget_seconds * share
        spent = 0.0
        for take in by_context[context]:
            if spent >= allowance:
                leftovers.append(take)
            else:
                chosen.append(take)
                spent += take.duration

    # A singer missing a whole context should still get a full budget from the others.
    spent = sum(t.duration for t in chosen)
    for take in sorted(leftovers, key=lambda t: -t.duration):
        if spent >= budget_seconds:
            break
        chosen.append(take)
        spent += take.duration
    return chosen


def reference_windows(takes: list[Take], seconds: float) -> list[tuple[Take, float, float]]:
    """Three windows -- low, middle and high -- so the reference spans the singer, not one octave.

    Seed-VC copies timbre from this clip. Cutting it from the longest file, as the first version
    did, meant cutting it from an excerpt: one register, and always the same song.
    """
    measured = [t for t in takes if t.f0_median > 0]
    if not measured:
        return [(takes[0], 0.0, seconds)] if takes else []

    measured.sort(key=lambda t: t.f0_median)
    slice_seconds = seconds / 3.0
    picks = []
    for fraction in (0.1, 0.5, 0.9):
        index = min(len(measured) - 1, int(len(measured) * fraction))
        take = measured[index]
        # Take from the middle of the file, past any breath or attack at the edges.
        start = max(0.0, (take.duration - slice_seconds) / 2.0)
        picks.append((take, start, min(slice_seconds, take.duration - start)))
    return picks
