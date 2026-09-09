"""Where do we run, and how much GPU memory did the job use?"""
from __future__ import annotations

import platform
import shutil
import subprocess
import threading
from typing import Callable


def detect_device(preferred: str = "auto") -> str:
    """Pick cuda → mps → cpu. Explicit values are returned untouched."""
    if preferred != "auto":
        return preferred
    try:
        import torch  # heavy import, kept local
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def describe_gpu(device: str) -> str | None:
    if device == "cuda":
        try:
            import torch
            return torch.cuda.get_device_name(0)
        except Exception:  # noqa: BLE001 - best effort label only
            return "cuda"
    if device == "mps":
        chip = "Apple Silicon"
        if platform.system() == "Darwin":
            try:
                chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                      capture_output=True, text=True, check=True).stdout.strip() or chip
            except Exception:  # noqa: BLE001
                pass
        return f"{chip} (MPS)"
    return None


def _nvidia_smi_used_mb(nvidia_smi: str) -> float:
    out = subprocess.run([nvidia_smi, "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True, check=True).stdout
    return max(float(line) for line in out.split() if line.strip())


class VramSampler:
    """Polls GPU memory in a background thread and keeps the peak (MB).

    Models run in subprocesses, so torch's in-process allocator stats are useless here;
    nvidia-smi is the lowest-common-denominator that works for any child process.
    `query` can be injected for tests. Without nvidia-smi the sampler is a no-op.
    """

    def __init__(self, interval: float = 0.5, query: Callable[[], float] | None = None,
                 nvidia_smi_path: str | None = "auto") -> None:
        self.interval = interval
        if query is None and nvidia_smi_path is not None:
            path = shutil.which("nvidia-smi") if nvidia_smi_path == "auto" else nvidia_smi_path
            if path:
                query = lambda: _nvidia_smi_used_mb(path)  # noqa: E731
        self._query = query
        self.available = query is not None
        self.peak_mb: float | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _loop(self) -> None:
        assert self._query is not None
        while not self._stop.is_set():
            try:
                value = self._query()
                self.peak_mb = value if self.peak_mb is None else max(self.peak_mb, value)
            except Exception:  # noqa: BLE001 - a failed sample must not kill the job
                pass
            self._stop.wait(self.interval)

    def __enter__(self) -> "VramSampler":
        if self.available:
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
