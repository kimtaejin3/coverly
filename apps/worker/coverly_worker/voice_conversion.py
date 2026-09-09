"""Voice conversion providers. The pipeline only sees `VoiceConversionProvider`; Seed-VC is one
implementation, invoked as a subprocess inside its own virtualenv so its heavy, pinned dependency
set never leaks into the worker. Swapping to RVC = writing another ~40-line class here."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import Protocol

from .separation import Runner, default_runner

VOICE_EXTENSIONS = (".wav", ".flac", ".mp3", ".m4a")
SEEDVC_SHIM = Path(__file__).with_name("seedvc_shim.py")


class VoiceConversionError(RuntimeError):
    pass


class VoiceConversionProvider(Protocol):
    name: str

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path: ...


def resolve_voice(voice_id: str, voices_dir: Path) -> Path:
    """`voice_id` is either a path to a reference recording or a name under `voices_dir`."""
    direct = Path(voice_id)
    if direct.is_file():
        return direct
    for ext in VOICE_EXTENSIONS:
        candidate = voices_dir / f"{voice_id}{ext}"
        if candidate.is_file():
            return candidate
    raise VoiceConversionError(f"voice '{voice_id}' not found (looked for a file path or {voices_dir}/{voice_id}.wav)")


class PassthroughProvider:
    """Returns the vocals unchanged. Used for tests and to measure non-model overhead."""

    name = "passthrough"

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path:
        work_dir.mkdir(parents=True, exist_ok=True)
        return Path(shutil.copy(vocal_path, work_dir / "converted.wav"))


class SeedVCProvider:
    """Seed-VC v1 (`inference.py`) with the f0-conditioned 44.1 kHz singing model.

    Seed-VC writes `vc_<src>_<ref>_<len>_<steps>_<cfg>.wav` into `--output`; we give it a fresh
    directory per call and take the newest wav so a filename change upstream cannot break us.
    It also caches checkpoints under `./checkpoints` relative to cwd, hence `cwd=repo_dir`.
    inference.py is launched through `seedvc_shim.py` (same venv) so the device is explicit and
    the MPS float64 incompatibility is handled without patching the vendor checkout.
    """

    name = "seedvc"

    def __init__(self, repo_dir: Path, python: Path | None = None, voices_dir: Path = Path("voices"),
                 diffusion_steps: int = 30, inference_cfg_rate: float = 0.7, length_adjust: float = 1.0,
                 f0_condition: bool = True, auto_f0_adjust: bool = False, fp16: bool | None = None,
                 device: str = "cpu", runner: Runner = default_runner,
                 checkpoint: Path | None = None, config: Path | None = None) -> None:
        self.repo_dir = Path(repo_dir)
        default_python = self.repo_dir / ".venv" / "bin" / "python"
        self.python = Path(python) if python else (default_python if default_python.exists() else Path(sys.executable))
        self.voices_dir = Path(voices_dir)
        self.diffusion_steps = diffusion_steps
        self.inference_cfg_rate = inference_cfg_rate
        self.length_adjust = length_adjust
        self.f0_condition = f0_condition
        self.auto_f0_adjust = auto_f0_adjust
        self.fp16 = (device == "cuda") if fp16 is None else fp16  # fp16 autocast is CUDA-only in practice
        self.device = device
        self.runner = runner
        # A fine-tuned checkpoint replaces the stock singing model; it must travel with the config
        # it was trained against, which train.py copies into runs/<name>/.
        self.checkpoint = Path(checkpoint) if checkpoint else None
        self.config = Path(config) if config else None
        if (self.checkpoint is None) != (self.config is None):
            raise VoiceConversionError("checkpoint and config must be given together")

    def build_command(self, vocal_path: Path, reference_path: Path, out_dir: Path, pitch_shift: int) -> list[str]:
        cmd = [str(self.python), str(SEEDVC_SHIM),
                "--source", str(vocal_path),
                "--target", str(reference_path),
                "--output", str(out_dir),
                "--diffusion-steps", str(self.diffusion_steps),
                "--length-adjust", str(self.length_adjust),
                "--inference-cfg-rate", str(self.inference_cfg_rate),
                "--f0-condition", str(self.f0_condition),
                "--auto-f0-adjust", str(self.auto_f0_adjust),
                "--semi-tone-shift", str(pitch_shift),
                "--fp16", str(self.fp16)]
        if self.checkpoint and self.config:
            cmd += ["--checkpoint", str(self.checkpoint), "--config", str(self.config)]
        return cmd

    def convert(self, vocal_path: Path, voice_id: str, work_dir: Path, pitch_shift: int = 0) -> Path:
        if not (self.repo_dir / "inference.py").is_file():
            raise VoiceConversionError(f"Seed-VC checkout not found at {self.repo_dir}. "
                                       "Run apps/worker/scripts/setup_seedvc.sh first.")
        reference = resolve_voice(voice_id, self.voices_dir).resolve()
        out_dir = (work_dir / "seedvc_out").resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1", "SEEDVC_DEVICE": self.device}
        self.runner(self.build_command(vocal_path.resolve(), reference, out_dir, pitch_shift),
                    cwd=self.repo_dir, env=env)
        outputs = sorted(out_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime)
        if not outputs:
            raise VoiceConversionError(f"Seed-VC produced no wav in {out_dir}")
        return outputs[-1]
