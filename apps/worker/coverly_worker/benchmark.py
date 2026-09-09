"""Run the pipeline over N samples, aggregate timings, estimate GPU cost (PRD §19-20, §54)."""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path

from .cli import add_component_args, build_components
from .metrics import GPU_PRICES_USD_PER_SECOND, CostEstimate, estimate_cost
from .pipeline import GenerationRequest, run_generation

STAGE_KEYS = ["trim_seconds", "separation_seconds", "voice_conversion_seconds", "mixing_seconds", "total_seconds"]


@dataclass
class BenchmarkRow:
    input: str
    output: str | None
    ok: bool
    error: str | None
    metrics: dict | None


def summarize(rows: list[BenchmarkRow]) -> dict:
    ok_rows = [r for r in rows if r.ok and r.metrics]
    summary: dict = {"n": len(rows), "ok": len(ok_rows),
                     "success_rate": (len(ok_rows) / len(rows)) if rows else 0.0,
                     "stages": {}, "audio_duration_mean": None, "peak_vram_mb_max": None}
    if not ok_rows:
        return summary
    for key in STAGE_KEYS:
        values = [r.metrics[key] for r in ok_rows]
        summary["stages"][key] = {"mean": statistics.fmean(values), "median": statistics.median(values),
                                  "min": min(values), "max": max(values)}
    summary["audio_duration_mean"] = statistics.fmean(r.metrics["audio_duration_seconds"] for r in ok_rows)
    vram = [r.metrics["peak_vram_mb"] for r in ok_rows if r.metrics.get("peak_vram_mb") is not None]
    summary["peak_vram_mb_max"] = max(vram) if vram else None
    return summary


def format_summary(summary: dict, cost: CostEstimate | None) -> str:
    lines = [f"Benchmark: success {summary['ok']}/{summary['n']} ({summary['success_rate']:.0%})"]
    if summary["stages"]:
        lines.append(f"Audio per run: {summary['audio_duration_mean']:.1f} sec")
        lines.append(f"{'stage':<18}{'mean':>8}{'median':>8}{'min':>8}{'max':>8}")
        for key, s in summary["stages"].items():
            lines.append(f"{key.replace('_seconds', ''):<18}{s['mean']:>8.1f}{s['median']:>8.1f}"
                         f"{s['min']:>8.1f}{s['max']:>8.1f}")
        if summary["peak_vram_mb_max"] is not None:
            lines.append(f"Peak VRAM (max over runs): {summary['peak_vram_mb_max']:.0f} MB")
    if cost is not None:
        lines.append(f"Estimated cost per generation on {cost.gpu} @ {cost.billed_seconds:.1f} billed sec: "
                     f"${cost.usd:.4f} ≈ {cost.krw:.0f} KRW")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="benchmark.py",
                                     description="Benchmark the AI cover pipeline over several songs")
    parser.add_argument("--inputs", nargs="+", required=True, type=Path)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--start", type=float, default=30.0)
    parser.add_argument("--duration", type=float, default=30.0, help="0 = full song")
    parser.add_argument("--out-dir", type=Path, default=Path("bench_out"))
    parser.add_argument("--repeat", type=int, default=1, help="runs per input (use >1 to see warm-cache timings)")
    parser.add_argument("--gpu", default="L4",
                        help=f"price row for the cost estimate: {', '.join(GPU_PRICES_USD_PER_SECOND)}")
    parser.add_argument("--gpu-price-usd-per-sec", type=float, default=None, help="override the price table")
    parser.add_argument("--usd-krw", type=float, default=1400.0)
    add_component_args(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    separator, provider, device = build_components(args)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    voice_tag = Path(args.voice).stem
    rows: list[BenchmarkRow] = []
    for input_path in args.inputs:
        for i in range(args.repeat):
            suffix = f"_r{i + 1}" if args.repeat > 1 else ""
            output = args.out_dir / f"{input_path.stem}__{voice_tag}{suffix}.mp3"
            request = GenerationRequest(input_path=input_path, voice_id=args.voice, output_path=output,
                                        start=args.start, duration=None if args.duration <= 0 else args.duration)
            print(f"[{len(rows) + 1}] {input_path.name} → {output.name} ...", flush=True)
            try:
                result = run_generation(request, separator, provider, device=device)
                rows.append(BenchmarkRow(str(input_path), str(output), True, None, result.metrics.to_dict()))
                print(f"    total {result.metrics.total_seconds:.1f}s "
                      f"(sep {result.metrics.separation_seconds:.1f}s, "
                      f"vc {result.metrics.voice_conversion_seconds:.1f}s)", flush=True)
            except Exception as exc:  # noqa: BLE001 - a benchmark must record failures, not die
                rows.append(BenchmarkRow(str(input_path), None, False, f"{type(exc).__name__}: {exc}", None))
                print(f"    FAILED: {exc}", file=sys.stderr)
                traceback.print_exc()

    summary = summarize(rows)
    cost = None
    if summary["stages"]:
        cost = estimate_cost(summary["stages"]["total_seconds"]["mean"], gpu=args.gpu,
                             usd_per_second=args.gpu_price_usd_per_sec, usd_krw=args.usd_krw)
    (args.out_dir / "results.json").write_text(json.dumps(
        {"device": device, "separator": separator.name, "provider": provider.name,
         "rows": [asdict(r) for r in rows], "summary": summary, "cost": asdict(cost) if cost else None}, indent=2))
    with (args.out_dir / "results.csv").open("w", newline="") as f:
        fields = ["input", "output", "ok", "error", *STAGE_KEYS, "audio_duration_seconds", "peak_vram_mb"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            m = r.metrics or {}
            writer.writerow({"input": r.input, "output": r.output, "ok": r.ok, "error": r.error,
                             **{k: m.get(k) for k in [*STAGE_KEYS, "audio_duration_seconds", "peak_vram_mb"]}})
    with (args.out_dir / "review_template.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["output", "usable", "notes"])
        writer.writeheader()
        for r in rows:
            if r.output:
                writer.writerow({"output": Path(r.output).name, "usable": "", "notes": ""})
    print()
    print(format_summary(summary, cost))
    print(f"\nResults: {args.out_dir / 'results.json'}\n"
          f"Listen to the mp3s and fill in {args.out_dir / 'review_template.csv'} "
          "(PRD §48: ≥7/10 must be publishable).")
    return 0 if summary["ok"] == summary["n"] else 2
