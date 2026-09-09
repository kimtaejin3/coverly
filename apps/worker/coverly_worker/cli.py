"""`python generate.py` — one AI cover from the command line (PRD §54)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .audio import FfmpegError
from .device import detect_device
from .pipeline import GenerationRequest, run_generation
from .separation import CopySeparator, DemucsSeparator, SeparationError, Separator, SubprocessError
from .voice_conversion import (PassthroughProvider, SeedVCProvider, VoiceConversionError,
                               VoiceConversionProvider)

WORKER_ROOT = Path(__file__).resolve().parent.parent


def add_component_args(parser: argparse.ArgumentParser) -> None:
    g = parser.add_argument_group("models")
    g.add_argument("--provider", choices=["seedvc", "passthrough"], default="seedvc",
                   help="voice conversion backend (passthrough = no conversion, for plumbing tests)")
    g.add_argument("--separator", choices=["demucs", "copy"], default="demucs",
                   help="source separation backend (copy = no separation, for plumbing tests)")
    g.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    g.add_argument("--demucs-model", default="htdemucs")
    g.add_argument("--diffusion-steps", type=int, default=30, help="Seed-VC steps; 30-50 recommended for singing")
    g.add_argument("--seedvc-dir", type=Path,
                   default=Path(os.environ.get("SEED_VC_DIR", WORKER_ROOT / "vendor" / "seed-vc")))
    g.add_argument("--seedvc-python", type=Path,
                   default=(Path(os.environ["SEED_VC_PYTHON"]) if os.environ.get("SEED_VC_PYTHON") else None))
    g.add_argument("--voices-dir", type=Path, default=WORKER_ROOT / "voices")


def build_components(args: argparse.Namespace) -> tuple[Separator, VoiceConversionProvider, str]:
    device = detect_device(args.device)
    separator: Separator = CopySeparator() if args.separator == "copy" else DemucsSeparator(
        model=args.demucs_model, device=device)
    provider: VoiceConversionProvider = PassthroughProvider() if args.provider == "passthrough" else SeedVCProvider(
        repo_dir=args.seedvc_dir, python=args.seedvc_python, voices_dir=args.voices_dir,
        diffusion_steps=args.diffusion_steps, device=device)
    return separator, provider, device


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="generate.py",
                                     description="Generate one AI cover (trim → separate → convert → mix)")
    parser.add_argument("--input", required=True, type=Path, help="song file (mp3/wav/m4a)")
    parser.add_argument("--voice", required=True, help="reference vocal wav path, or a name under --voices-dir")
    parser.add_argument("--start", type=float, default=30.0, help="section start in seconds (default 30)")
    parser.add_argument("--duration", type=float, default=30.0, help="section length in seconds; 0 = to end of song")
    parser.add_argument("--output", required=True, type=Path, help="output mp3 path")
    parser.add_argument("--pitch-shift", type=int, default=0, help="semitones applied to the converted vocal")
    parser.add_argument("--keep-work", action="store_true", help="keep intermediate files")
    parser.add_argument("--work-dir", type=Path, default=None, help="where intermediates go (implies --keep-work)")
    parser.add_argument("--metrics-json", type=Path, default=None, help="also write metrics as JSON here")
    add_component_args(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    separator, provider, device = build_components(args)
    request = GenerationRequest(
        input_path=args.input, voice_id=args.voice, output_path=args.output,
        start=args.start, duration=None if args.duration <= 0 else args.duration,
        pitch_shift=args.pitch_shift, work_dir=args.work_dir,
        keep_work=args.keep_work or args.work_dir is not None,
    )
    try:
        result = run_generation(request, separator, provider, device=device)
    except (FileNotFoundError, FfmpegError, SeparationError, VoiceConversionError, SubprocessError) as exc:
        print(f"generation failed: {exc}", file=sys.stderr)
        return 1
    print(result.metrics.format_report())
    print(f"\nOutput: {result.output_path}")
    if result.work_dir:
        print(f"Work dir: {result.work_dir}")
    if args.metrics_json:
        args.metrics_json.parent.mkdir(parents=True, exist_ok=True)
        payload = {**result.metrics.to_dict(), "input": str(args.input), "voice": args.voice,
                   "effective_start": result.effective_start, "output": str(result.output_path)}
        args.metrics_json.write_text(json.dumps(payload, indent=2))
    return 0
