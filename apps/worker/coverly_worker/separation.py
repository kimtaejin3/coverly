"""Source separation: vocals vs. everything else. Demucs is invoked as a subprocess so it can be
replaced by any other tool (or a remote service) without touching the pipeline."""
from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol


class SubprocessError(RuntimeError):
    """A child tool exited non-zero; message carries the tail of stderr."""


class SeparationError(RuntimeError):
    """Separator finished but the expected stems are missing."""


Runner = Callable[..., None]


def default_runner(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> None:
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SubprocessError(f"command failed ({proc.returncode}): {' '.join(cmd)}\n"
                              f"{proc.stderr[-3000:]}")


@dataclass(frozen=True)
class SeparatedStems:
    vocals: Path
    instrumental: Path


class Separator(Protocol):
    name: str

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems: ...


class DemucsSeparator:
    """`python -m demucs --two-stems vocals` → work_dir/separated/<model>/{vocals,no_vocals}.wav"""

    name = "demucs"

    def __init__(self, model: str = "htdemucs", device: str = "cpu", python: str = sys.executable,
                 runner: Runner = default_runner, segment: int | None = None, shifts: int = 1) -> None:
        self.model = model
        self.device = device
        self.python = python
        self.runner = runner
        self.segment = segment
        self.shifts = shifts

    def build_command(self, audio_path: Path, out_dir: Path) -> list[str]:
        cmd = [self.python, "-m", "demucs", "-n", self.model, "--two-stems", "vocals",
               "-d", self.device, "-o", str(out_dir), "--filename", "{stem}.{ext}",
               "--shifts", str(self.shifts)]
        if self.segment:
            cmd += ["--segment", str(self.segment)]
        cmd.append(str(audio_path))
        return cmd

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems:
        out_dir = work_dir / "separated"
        self.runner(self.build_command(audio_path, out_dir))
        stems = SeparatedStems(vocals=out_dir / self.model / "vocals.wav",
                               instrumental=out_dir / self.model / "no_vocals.wav")
        for path in (stems.vocals, stems.instrumental):
            if not path.exists():
                raise SeparationError(f"demucs did not produce {path}")
        return stems


class CopySeparator:
    """No-op separator for tests/dry runs: both stems are copies of the input."""

    name = "copy"

    def separate(self, audio_path: Path, work_dir: Path) -> SeparatedStems:
        out_dir = work_dir / "separated" / "copy"
        out_dir.mkdir(parents=True, exist_ok=True)
        vocals = shutil.copy(audio_path, out_dir / "vocals.wav")
        inst = shutil.copy(audio_path, out_dir / "no_vocals.wav")
        return SeparatedStems(vocals=Path(vocals), instrumental=Path(inst))
