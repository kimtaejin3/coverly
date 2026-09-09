import math
import struct
import wave
from pathlib import Path

import pytest


@pytest.fixture
def tone_wav(tmp_path: Path):
    """Create a small PCM16 sine-wave WAV without any third-party dependency."""

    def _make(name: str = "tone.wav", seconds: float = 2.0, freq: float = 440.0,
              rate: int = 44100, channels: int = 2) -> Path:
        path = tmp_path / name
        n_frames = int(seconds * rate)
        frames = bytearray()
        for i in range(n_frames):
            sample = int(12000 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", sample) * channels
        with wave.open(str(path), "wb") as w:
            w.setnchannels(channels)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(bytes(frames))
        return path

    return _make
