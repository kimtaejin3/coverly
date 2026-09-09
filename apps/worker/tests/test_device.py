import time

from coverly_worker.device import VramSampler, describe_gpu, detect_device


def test_detect_device_honours_explicit_choice():
    assert detect_device("cpu") == "cpu"
    assert detect_device("cuda") == "cuda"


def test_detect_device_auto_returns_known_value():
    assert detect_device("auto") in {"cuda", "mps", "cpu"}


def test_describe_gpu_cpu_is_none():
    assert describe_gpu("cpu") is None


def test_vram_sampler_tracks_peak_from_injected_query():
    readings = iter([1000.0, 4200.0, 3000.0])
    sampler = VramSampler(interval=0.01, query=lambda: next(readings, 3000.0))
    with sampler:
        time.sleep(0.1)
    assert sampler.available is True
    assert sampler.peak_mb == 4200.0


def test_vram_sampler_without_nvidia_smi_reports_none():
    sampler = VramSampler(interval=0.01, query=None, nvidia_smi_path=None)
    with sampler:
        pass
    assert sampler.available is False
    assert sampler.peak_mb is None
