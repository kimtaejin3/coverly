from pathlib import Path

import pytest

from coverly_worker.audio import probe_duration
from coverly_worker.pipeline import GenerationRequest, clamp_section, run_generation
from coverly_worker.separation import CopySeparator
from coverly_worker.voice_conversion import PassthroughProvider


@pytest.mark.parametrize("total,start,duration,expected", [
    (240.0, 30.0, 30.0, (30.0, 30.0)),      # normal
    (240.0, 230.0, 30.0, (210.0, 30.0)),    # slides window back to fit
    (20.0, 30.0, 30.0, (0.0, 20.0)),        # song shorter than section → whole song
    (240.0, -5.0, 30.0, (0.0, 30.0)),       # negative start clamps to 0
    (240.0, 10.0, None, (10.0, None)),      # full cover from 10 s
])
def test_clamp_section(total, start, duration, expected):
    assert clamp_section(total, start, duration) == expected


def test_clamp_section_rejects_non_positive_duration():
    with pytest.raises(ValueError):
        clamp_section(100.0, 0.0, 0.0)


def test_run_generation_end_to_end_with_fakes(tone_wav, tmp_path):
    song = tone_wav("song.wav", seconds=3.0)
    request = GenerationRequest(input_path=song, voice_id="any", output_path=tmp_path / "out" / "cover.mp3",
                                start=1.0, duration=1.0)
    result = run_generation(request, CopySeparator(), PassthroughProvider(), device="cpu")
    assert result.output_path.exists()
    assert probe_duration(result.output_path) == pytest.approx(1.0, abs=0.15)
    m = result.metrics
    assert m.audio_duration_seconds == pytest.approx(1.0, abs=0.05)
    assert m.separator == "copy" and m.provider == "passthrough" and m.device == "cpu"
    assert m.total_seconds >= m.trim_seconds + m.separation_seconds + m.voice_conversion_seconds + m.mixing_seconds - 1e-6
    assert result.effective_start == 1.0
    assert result.work_dir is None  # temp dir was cleaned up


def test_run_generation_keeps_work_dir_when_asked(tone_wav, tmp_path):
    song = tone_wav("song.wav", seconds=2.0)
    work = tmp_path / "work"
    request = GenerationRequest(input_path=song, voice_id="any", output_path=tmp_path / "cover.mp3",
                                start=0.0, duration=1.0, work_dir=work, keep_work=True)
    result = run_generation(request, CopySeparator(), PassthroughProvider())
    assert result.work_dir == work
    assert (work / "trimmed.wav").exists()
    assert (work / "separated" / "copy" / "vocals.wav").exists()


def test_run_generation_missing_input(tmp_path):
    request = GenerationRequest(input_path=tmp_path / "nope.mp3", voice_id="any", output_path=tmp_path / "o.mp3")
    with pytest.raises(FileNotFoundError):
        run_generation(request, CopySeparator(), PassthroughProvider())
