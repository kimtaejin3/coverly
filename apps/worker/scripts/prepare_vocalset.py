#!/usr/bin/env python
"""Turn VocalSet singers into Coverly voices.

VocalSet (https://zenodo.org/records/1193957) is 10.1 hours of professional singers demonstrating
vocal techniques on all five vowels, released under CC BY 4.0 — which permits commercial use with
attribution, unlike most singing datasets. It ships one folder per singer, so each singer becomes
one voice: concatenate their cleanest takes into a training set and cut a reference clip.

    python scripts/prepare_vocalset.py --root datasets/_raw/VocalSet --list
    python scripts/prepare_vocalset.py --root datasets/_raw/VocalSet --singer female1 --name aria

Attribution is required by the licence; `voices/<name>.ATTRIBUTION.txt` is written next to every
voice so the credit travels with the asset.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKER))

from coverly_worker.audio import probe_duration, trim  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vocalset_select import measure, pick_takes, reference_windows, semitones  # noqa: E402

ATTRIBUTION = """This voice was built from VocalSet.

VocalSet: A Singing Voice Dataset
Julia Wilkins, Prem Seetharaman, Alison Wahl, Bryan Pardo
ISMIR 2018 — https://zenodo.org/records/1193957
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

Singer folder used: {singer}
"""

def singer_dirs(root: Path) -> list[Path]:
    return sorted(
        (p for p in root.rglob("*") if p.is_dir() and any(p.glob("**/*.wav"))
         and p.name.lower().startswith(("male", "female"))),
        key=lambda p: p.name,
    )


def build_reference(picks, output: Path) -> None:
    """Concatenate the low, middle and high windows into one reference clip."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for index, (take, start, length) in enumerate(picks):
            part = Path(tmp) / f"part{index}.wav"
            trim(take.path, part, start, length, channels=1)
            parts.append(part)

        # ffmpeg resolves concat entries relative to the list file, so absolute paths only.
        listing = Path(tmp) / "list.txt"
        listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", str(listing), "-ac", "1", "-ar", "44100", str(output)],
            check=True,
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="prepare_vocalset.py")
    parser.add_argument("--root", type=Path, required=True, help="unzipped VocalSet directory")
    parser.add_argument("--list", action="store_true", help="list singers and exit")
    parser.add_argument("--singer", help="singer folder name, e.g. female1")
    parser.add_argument("--name", help="voice id to create, e.g. aria")
    parser.add_argument("--minutes", type=float, default=10.0, help="training audio budget")
    parser.add_argument("--reference-seconds", type=int, default=22)
    parser.add_argument("--clip-seconds", type=int, default=15)
    args = parser.parse_args(argv)

    if not args.root.is_dir():
        print(f"no such directory: {args.root}", file=sys.stderr)
        return 1

    singers = singer_dirs(args.root)
    if args.list or not (args.singer and args.name):
        print(f"{len(singers)} singers under {args.root}:")
        for d in singers:
            takes = list(d.rglob("*.wav"))
            total = sum(probe_duration(w) for w in takes[:40])
            print(f"  {d.name:<10} {len(takes):>4} takes  (~{total / 60:.1f} min in first 40)")
        return 0

    match = next((d for d in singers if d.name.lower() == args.singer.lower()), None)
    if match is None:
        print(f"singer '{args.singer}' not found; run --list", file=sys.stderr)
        return 1

    takes = pick_takes(match, args.minutes * 60, probe_duration)
    if not takes:
        print(f"no usable takes in {match}", file=sys.stderr)
        return 1

    print(f"measuring pitch across {len(takes)} takes…")
    for take in takes:
        take.f0_low, take.f0_median, take.f0_high = measure(take.path)

    dataset_dir = WORKER / "datasets" / args.name
    voices_dir = WORKER / "voices"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    voices_dir.mkdir(parents=True, exist_ok=True)
    for old in dataset_dir.glob("*.wav"):
        old.unlink()

    # Seed-VC ignores clips outside 1-30 s, so long takes are split rather than dropped.
    written = 0
    for take in takes:
        offset = 0.0
        while take.duration - offset >= 2.0:
            length = min(float(args.clip_seconds), take.duration - offset)
            written += 1
            trim(take.path, dataset_dir / f"{args.name}_{written:03d}.wav",
                 offset, length, channels=1)
            offset += length

    reference = voices_dir / f"{args.name}.wav"
    build_reference(reference_windows(takes, float(args.reference_seconds)), reference)

    (voices_dir / f"{args.name}.ATTRIBUTION.txt").write_text(
        ATTRIBUTION.format(singer=match.name)
    )

    voiced = [t for t in takes if t.f0_median > 0]
    lows = min((t.f0_low for t in voiced), default=0.0)
    highs = max((t.f0_high for t in voiced), default=0.0)
    contexts: dict[str, float] = {}
    for take in takes:
        contexts[take.context] = contexts.get(take.context, 0.0) + take.duration

    print(f"voice '{args.name}' from VocalSet/{match.name}")
    print(f"  range   : {lows:.0f}-{highs:.0f} Hz ({semitones(lows, highs):.1f} semitones)")
    print("  mix     : " + ", ".join(
        f"{c} {d / 60:.1f}m" for c, d in sorted(contexts.items(), key=lambda kv: -kv[1])))
    print(f"  dataset : {dataset_dir} ({written} clips)")
    print(f"  reference: {reference} ({args.reference_seconds}s)")
    print(f"  credit  : {voices_dir / f'{args.name}.ATTRIBUTION.txt'}")
    print(f"\n다음: ./scripts/finetune_local.sh {args.name} 1000")
    return 0


if __name__ == "__main__":
    sys.exit(main())
