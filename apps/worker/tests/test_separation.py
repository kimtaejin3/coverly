import os
from pathlib import Path

import pytest

from coverly_worker.separation import (CopySeparator, DemucsSeparator, SeparationError,
                                       SubprocessError, default_runner)


def test_demucs_command_has_two_stems_and_output_layout(tmp_path):
    sep = DemucsSeparator(model="htdemucs", device="cpu", python="/venv/bin/python")
    cmd = sep.build_command(Path("/in/trimmed.wav"), tmp_path / "separated")
    assert cmd[:3] == ["/venv/bin/python", "-m", "demucs"]
    assert "--two-stems" in cmd and cmd[cmd.index("--two-stems") + 1] == "vocals"
    assert cmd[cmd.index("-n") + 1] == "htdemucs"
    assert cmd[cmd.index("-d") + 1] == "cpu"
    assert cmd[cmd.index("--filename") + 1] == "{stem}.{ext}"
    assert cmd[-1] == "/in/trimmed.wav"


def test_demucs_separate_returns_stems_written_by_runner(tmp_path):
    def fake_runner(cmd, cwd=None, env=None):
        out_dir = Path(cmd[cmd.index("-o") + 1]) / "htdemucs"
        out_dir.mkdir(parents=True)
        (out_dir / "vocals.wav").write_bytes(b"v")
        (out_dir / "no_vocals.wav").write_bytes(b"i")

    sep = DemucsSeparator(runner=fake_runner)
    stems = sep.separate(tmp_path / "trimmed.wav", tmp_path)
    assert stems.vocals.read_bytes() == b"v"
    assert stems.instrumental.read_bytes() == b"i"


def test_demucs_separate_raises_when_outputs_missing(tmp_path):
    sep = DemucsSeparator(runner=lambda cmd, cwd=None, env=None: None)
    with pytest.raises(SeparationError):
        sep.separate(tmp_path / "trimmed.wav", tmp_path)


def test_copy_separator_duplicates_input(tone_wav, tmp_path):
    src = tone_wav()
    stems = CopySeparator().separate(src, tmp_path)
    assert stems.vocals.read_bytes() == src.read_bytes()
    assert stems.instrumental.read_bytes() == src.read_bytes()
    assert stems.vocals != stems.instrumental


def test_default_runner_raises_with_stderr():
    with pytest.raises(SubprocessError, match="boom"):
        default_runner(["sh", "-c", "echo boom >&2; exit 3"])


@pytest.mark.integration
@pytest.mark.skipif(not os.environ.get("COVERLY_RUN_INTEGRATION"), reason="set COVERLY_RUN_INTEGRATION=1")
def test_real_demucs_on_tone(tone_wav, tmp_path):
    from coverly_worker.audio import probe_duration
    src = tone_wav(seconds=4.0)
    stems = DemucsSeparator(device="cpu").separate(src, tmp_path)
    assert probe_duration(stems.vocals) == pytest.approx(4.0, abs=0.1)
    assert probe_duration(stems.instrumental) == pytest.approx(4.0, abs=0.1)
