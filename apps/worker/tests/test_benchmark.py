import csv
import json

from coverly_worker.benchmark import BenchmarkRow, format_summary, main, summarize
from coverly_worker.metrics import estimate_cost


def _row(total, ok=True):
    m = None if not ok else dict(audio_duration_seconds=30.0, trim_seconds=1.0, separation_seconds=2.0,
                                 voice_conversion_seconds=3.0, mixing_seconds=1.0, total_seconds=total,
                                 device="cpu", gpu_name=None, peak_vram_mb=None, separator="copy", provider="passthrough")
    return BenchmarkRow(input="a.mp3", output="a.mp3" if ok else None, ok=ok, error=None if ok else "boom", metrics=m)


def test_summarize_aggregates_ok_rows_only():
    s = summarize([_row(10.0), _row(20.0), _row(0.0, ok=False)])
    assert s["n"] == 3 and s["ok"] == 2
    assert s["success_rate"] == 2 / 3
    assert s["stages"]["total_seconds"]["mean"] == 15.0
    assert s["stages"]["total_seconds"]["median"] == 15.0
    assert s["stages"]["total_seconds"]["min"] == 10.0
    assert s["stages"]["total_seconds"]["max"] == 20.0


def test_summarize_handles_no_successes():
    s = summarize([_row(0.0, ok=False)])
    assert s["ok"] == 0 and s["stages"] == {}


def test_format_summary_mentions_cost():
    s = summarize([_row(30.0)])
    text = format_summary(s, estimate_cost(30.0, gpu="L4", usd_krw=1400.0))
    assert "success 1/1" in text
    assert "L4" in text and "KRW" in text


def test_benchmark_main_writes_results(tone_wav, tmp_path):
    a = tone_wav("a.wav", seconds=2.0)
    b = tone_wav("b.wav", seconds=2.0, freq=330.0)
    out_dir = tmp_path / "bench"
    code = main(["--inputs", str(a), str(b), "--voice", "x", "--start", "0", "--duration", "1",
                 "--out-dir", str(out_dir), "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 0
    results = json.loads((out_dir / "results.json").read_text())
    assert len(results["rows"]) == 2 and results["summary"]["success_rate"] == 1.0
    assert results["cost"]["gpu"] == "L4"
    with (out_dir / "results.csv").open() as f:
        assert len(list(csv.DictReader(f))) == 2
    with (out_dir / "review_template.csv").open() as f:
        rows = list(csv.DictReader(f))
        assert rows[0]["usable"] == "" and len(rows) == 2
    assert len(list(out_dir.glob("*.mp3"))) == 2
