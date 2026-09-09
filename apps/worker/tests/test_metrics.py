import pytest

from coverly_worker.metrics import (GPU_PRICES_USD_PER_SECOND, GenerationMetrics, StageTimer,
                                    estimate_cost)


def test_stage_timer_records_each_stage_and_total():
    timer = StageTimer()
    with timer.stage("trim"):
        pass
    with timer.stage("separation"):
        pass
    assert set(timer.stages) == {"trim", "separation"}
    assert timer.total() == pytest.approx(sum(timer.stages.values()))


def _metrics(**overrides) -> GenerationMetrics:
    base = dict(audio_duration_seconds=30.0, trim_seconds=0.8, separation_seconds=8.1,
                voice_conversion_seconds=19.4, mixing_seconds=1.2, total_seconds=29.5,
                device="cuda", gpu_name="NVIDIA L4", peak_vram_mb=5120.0,
                separator="demucs", provider="seedvc")
    base.update(overrides)
    return GenerationMetrics(**base)


def test_report_matches_prd_format():
    report = _metrics().format_report()
    assert "Generation completed" in report
    assert "Audio: 30.0 sec" in report
    assert "GPU: NVIDIA L4" in report
    assert "Trim: 0.8 sec" in report
    assert "Separation: 8.1 sec" in report
    assert "Voice Conversion: 19.4 sec" in report
    assert "Mix: 1.2 sec" in report
    assert "Total: 29.5 sec" in report
    assert "Peak VRAM: 5120 MB" in report


def test_report_without_gpu_says_cpu():
    report = _metrics(device="cpu", gpu_name=None, peak_vram_mb=None).format_report()
    assert "GPU: none (cpu)" in report
    assert "Peak VRAM" not in report


def test_to_dict_roundtrips_all_fields():
    d = _metrics().to_dict()
    assert d["voice_conversion_seconds"] == 19.4
    assert d["provider"] == "seedvc"


def test_estimate_cost_uses_gpu_table_and_fx():
    cost = estimate_cost(30.0, gpu="L4", usd_krw=1400.0)
    assert cost.usd == pytest.approx(30.0 * GPU_PRICES_USD_PER_SECOND["L4"])
    assert cost.krw == pytest.approx(cost.usd * 1400.0)


def test_estimate_cost_accepts_explicit_price():
    cost = estimate_cost(10.0, gpu="custom", usd_per_second=0.001, usd_krw=1000.0)
    assert cost.usd == pytest.approx(0.01)
    assert cost.krw == pytest.approx(10.0)


def test_estimate_cost_unknown_gpu_without_price_raises():
    with pytest.raises(KeyError):
        estimate_cost(10.0, gpu="RTX9999")
