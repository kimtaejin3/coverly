from pathlib import Path

import pytest

from coverly_worker.audio import FfmpegError, mix, probe_duration, trim


def test_probe_duration_reads_wav_length(tone_wav):
    path = tone_wav(seconds=2.0)
    assert probe_duration(path) == pytest.approx(2.0, abs=0.05)


def test_probe_duration_raises_on_missing_file(tmp_path):
    with pytest.raises(FfmpegError):
        probe_duration(tmp_path / "nope.wav")


def test_trim_cuts_requested_window(tone_wav, tmp_path):
    src = tone_wav(seconds=3.0)
    out = trim(src, tmp_path / "trimmed.wav", start=0.5, duration=1.0)
    assert out.exists()
    assert probe_duration(out) == pytest.approx(1.0, abs=0.05)


def test_trim_without_duration_runs_to_end(tone_wav, tmp_path):
    src = tone_wav(seconds=3.0)
    out = trim(src, tmp_path / "tail.wav", start=1.0, duration=None)
    assert probe_duration(out) == pytest.approx(2.0, abs=0.05)


def test_mix_produces_mp3_of_longest_input(tone_wav, tmp_path):
    vocals = tone_wav("vocals.wav", seconds=1.5, freq=660.0, channels=1)
    inst = tone_wav("inst.wav", seconds=2.0, freq=220.0)
    out = mix(vocals, inst, tmp_path / "cover.mp3")
    assert out.exists() and out.stat().st_size > 1000
    assert probe_duration(out) == pytest.approx(2.0, abs=0.15)
