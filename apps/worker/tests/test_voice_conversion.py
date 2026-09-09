from pathlib import Path

import pytest

from coverly_worker.voice_conversion import (PassthroughProvider, SeedVCProvider,
                                             VoiceConversionError, resolve_voice)


def test_resolve_voice_accepts_direct_path(tone_wav, tmp_path):
    ref = tone_wav("ref.wav")
    assert resolve_voice(str(ref), tmp_path / "voices") == ref


def test_resolve_voice_looks_up_named_voice(tmp_path):
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "warm_male.wav").write_bytes(b"x")
    assert resolve_voice("warm_male", voices) == voices / "warm_male.wav"


def test_resolve_voice_missing_raises(tmp_path):
    with pytest.raises(VoiceConversionError, match="nope"):
        resolve_voice("nope", tmp_path)


def test_passthrough_copies_vocals(tone_wav, tmp_path):
    vocals = tone_wav("vocals.wav")
    out = PassthroughProvider().convert(vocals, "any", tmp_path)
    assert out.read_bytes() == vocals.read_bytes()
    assert out != vocals


def test_seedvc_command_for_singing_on_cpu(tmp_path):
    provider = SeedVCProvider(repo_dir=tmp_path / "seed-vc", python=Path("/venv/bin/python"),
                              diffusion_steps=40, device="cpu")
    cmd = provider.build_command(Path("/w/vocals.wav"), Path("/voices/a.wav"), tmp_path / "out", pitch_shift=2)
    assert cmd[0] == "/venv/bin/python" and cmd[1].endswith("seedvc_shim.py")
    assert cmd[cmd.index("--source") + 1] == "/w/vocals.wav"
    assert cmd[cmd.index("--target") + 1] == "/voices/a.wav"
    assert cmd[cmd.index("--output") + 1] == str(tmp_path / "out")
    assert cmd[cmd.index("--diffusion-steps") + 1] == "40"
    assert cmd[cmd.index("--f0-condition") + 1] == "True"
    assert cmd[cmd.index("--auto-f0-adjust") + 1] == "False"
    assert cmd[cmd.index("--semi-tone-shift") + 1] == "2"
    assert cmd[cmd.index("--fp16") + 1] == "False"


def test_seedvc_fp16_defaults_true_on_cuda(tmp_path):
    provider = SeedVCProvider(repo_dir=tmp_path, python=Path("/p"), device="cuda")
    cmd = provider.build_command(Path("/v.wav"), Path("/r.wav"), tmp_path / "o", pitch_shift=0)
    assert cmd[cmd.index("--fp16") + 1] == "True"


def test_seedvc_convert_returns_newest_wav_and_runs_in_repo_dir(tmp_path):
    repo = tmp_path / "seed-vc"
    repo.mkdir()
    (repo / "inference.py").write_text("")
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "a.wav").write_bytes(b"ref")
    seen = {}

    def fake_runner(cmd, cwd=None, env=None):
        seen["cwd"], seen["env"] = cwd, env
        out_dir = Path(cmd[cmd.index("--output") + 1])
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "vc_vocals_a_1.0_30_0.7.wav").write_bytes(b"converted")

    provider = SeedVCProvider(repo_dir=repo, python=Path("/p"), voices_dir=voices, runner=fake_runner)
    out = provider.convert(tmp_path / "vocals.wav", "a", tmp_path / "work")
    assert out.read_bytes() == b"converted"
    assert seen["cwd"] == repo
    assert seen["env"]["PYTORCH_ENABLE_MPS_FALLBACK"] == "1"
    assert seen["env"]["SEEDVC_DEVICE"] == "cpu"


def test_seedvc_convert_without_output_raises(tmp_path):
    repo = tmp_path / "seed-vc"
    repo.mkdir()
    (repo / "inference.py").write_text("")
    ref = tmp_path / "r.wav"
    ref.write_bytes(b"")
    provider = SeedVCProvider(repo_dir=repo, python=Path("/p"), runner=lambda cmd, cwd=None, env=None: None)
    with pytest.raises(VoiceConversionError):
        provider.convert(tmp_path / "vocals.wav", str(ref), tmp_path / "work")


def test_seedvc_requires_repo_checkout(tmp_path):
    with pytest.raises(VoiceConversionError, match="setup_seedvc"):
        SeedVCProvider(repo_dir=tmp_path / "missing", python=Path("/p")).convert(
            tmp_path / "v.wav", str(tmp_path / "v.wav"), tmp_path)
