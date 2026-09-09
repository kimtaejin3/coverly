"""Launcher for Seed-VC's inference.py, executed with the Seed-VC venv python (cwd = repo).

Seed-VC picks its device itself (cuda → mps → cpu) and its inference path is only exercised on
CUDA/CPU upstream. This shim makes device selection explicit via SEEDVC_DEVICE and papers over
the one MPS incompatibility we hit (RMVPE returns float64 numpy f0; MPS has no float64):

    SEEDVC_DEVICE=cpu  → hide CUDA and MPS so torch falls back to CPU
    SEEDVC_DEVICE=mps  → cast float64 numpy arrays to float32 in torch.from_numpy
    SEEDVC_DEVICE=cuda / unset → no patches

Standalone on purpose: it runs inside the vendor venv, which does not have coverly_worker.
Usage: python seedvc_shim.py <inference.py args...>
"""
import os
import runpy
import sys

import numpy as np
import torch

device = os.environ.get("SEEDVC_DEVICE", "").lower()

if device == "cpu":
    torch.cuda.is_available = lambda: False  # type: ignore[assignment]
    torch.backends.mps.is_available = lambda: False  # type: ignore[assignment]
elif device == "mps":
    _from_numpy = torch.from_numpy

    def _from_numpy_mps_safe(array):
        if isinstance(array, np.ndarray) and array.dtype == np.float64:
            array = array.astype(np.float32)
        return _from_numpy(array)

    torch.from_numpy = _from_numpy_mps_safe  # type: ignore[assignment]

# `python inference.py` puts the repo on sys.path[0]; runpy.run_path does not, so do it by hand.
sys.path.insert(0, os.getcwd())
sys.argv = ["inference.py", *sys.argv[1:]]
runpy.run_path("inference.py", run_name="__main__")
