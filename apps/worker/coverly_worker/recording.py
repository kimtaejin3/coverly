"""Reading a personal-voice recording before it costs twenty GPU-minutes.

Two things went wrong with the catalogue voices and both apply here. The reference clip was cut
from the start of the audio, which is whichever register the singer happened to begin in; and
nothing checked that the recording contained singing at all. A 20-minute fine-tune on a silent or
spoken take produces a voice that cannot be salvaged, and the owner only finds out at the end.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000
# 아리랑 covers roughly an octave; sung in two keys it should clear this comfortably. The floor is
# set to catch speaking and monotone humming, not to grade the performance.
MIN_SPAN_SEMITONES = 6.0
MIN_VOICED_RATIO = 0.20
MIN_RMS_DB = -42.0
MIN_DURATION = 25.0

# 스케일 녹음: 한 음을 이만큼은 끌어야 "낸 음"으로 인정한다. 스쳐 지나간 프레임과
# pyin 의 옥타브 오류를 여기서 거른다.
MIN_NOTE_SECONDS = 0.28
# 지속음이라면 안정 구간의 f0 가 이 범위 안에 머문다. 넘으면 글리산도이거나 추적 실패다.
MAX_NOTE_WOBBLE_SEMITONES = 1.2

# 진성에서 가성으로 넘어가면 H1-H2 가 이만큼은 뛴다.
#
# 가성은 성문 파형이 정현파에 가까워서 기음만 남고 배음이 죽는다 -- 그래서 H1 이 H2 보다
# 커지고, 스펙트럼 기울기도 -12 dB/oct 근처(진성)에서 -18 정도로 가팔라진다. 절대 임계값을
# 쓰지 않는 이유는 마이크와 목소리마다 기준선이 다르기 때문이다. 한 사람의 한 번의 스케일
# 안에서 '아래쪽 음들 대비 얼마나 뛰었나'를 보면 기기와 개인차가 상쇄된다.
PASSAGGIO_H1H2_JUMP_DB = 8.0


@dataclass
class RecordingStats:
    duration: float
    voiced_ratio: float
    rms_db: float
    f0_low: float
    f0_median: float
    f0_high: float
    #: Near the actual top of what was sung. f0_high is the 90th percentile -- the top of the
    #: *comfortable* range -- and a song's few highest notes sit well above it. Those notes are
    #: what a voice model cannot reach and what makes a cover crack, so matching needs this.
    f0_peak: float
    span_semitones: float
    times: np.ndarray
    f0: np.ndarray


@dataclass
class Note:
    """One held note from a scale take."""
    start: float
    end: float
    hz: float
    #: First minus second harmonic, in dB. Rises sharply when a singer flips into falsetto.
    h1_h2_db: float = 0.0
    #: "modal"(진성) or "falsetto"(가성). Decided across the take, not note by note.
    register: str = "modal"


@dataclass
class ScaleStats:
    duration: float
    notes: list[Note]
    f0_low: float
    #: 본인이 "여기부터 힘들어요"를 누른 지점. 곡 추천의 편안함 경계.
    comfort_high: float
    #: 가성과 성대 긴장을 포함해 실제로 낸 가장 높은 지속음.
    absolute_high: float
    #: 진성으로 낸 가장 높은 음.
    #:
    #: 곡 DB 의 최고음은 78곡 중 77곡이 진성 기준이다. 가성이 섞인 천장과 비교하면 가성으로만
    #: 닿는 음을 진성으로 부를 수 있다고 말하게 된다 -- 매칭에 써야 하는 건 이 값이다.
    modal_high: float = 0.0
    #: 가성으로 낸 가장 높은 음. 보여주는 값이지 매칭 기준이 아니다.
    falsetto_high: float = 0.0


def _h1_h2_db(segment: np.ndarray, sr: int, f0: float) -> float:
    """First harmonic minus second, in dB, over one held note.

    The pair is read straight off the magnitude spectrum at f0 and 2*f0 rather than from a source
    model. A sung vowel held for half a second gives a clean enough peak at both, and what matters
    here is the *change* across a take, not an absolute voice-quality figure.
    """
    if segment.size < 256 or f0 <= 0:
        return 0.0
    windowed = segment * np.hanning(segment.size)
    spectrum = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(segment.size, 1.0 / sr)
    if freqs.size < 2:
        return 0.0

    def peak_near(target: float) -> float:
        # Widen with the harmonic: pitch drifts a little over a held note, and the second harmonic
        # drifts twice as far in Hz.
        half = max(freqs[1], target * 0.06)
        band = (freqs >= target - half) & (freqs <= target + half)
        return float(spectrum[band].max()) if band.any() else 0.0

    h1, h2 = peak_near(f0), peak_near(2.0 * f0)
    if h1 <= 0 or h2 <= 0:
        return 0.0
    return float(20.0 * np.log10(h1 / h2))


def _split_registers(notes: list[Note]) -> None:
    """Mark where the voice flips into falsetto, in place.

    Walks up the take looking for the biggest jump in H1-H2 against the notes below it. A singer
    crosses the passaggio once, going up, and everything above it stays there -- so this is one
    decision about where the break is, not a vote on every note. Judging notes independently would
    scatter 진성 and 가성 through each other wherever one note happened to be breathy.
    """
    if len(notes) < 3:
        return
    ordered = sorted(notes, key=lambda n: n.hz)
    values = [n.h1_h2_db for n in ordered]
    best_index, best_jump = -1, 0.0
    # Means, not medians. A median ignores what you put into it -- dropping two falsetto notes into
    # the lower group left it reading the same, so every later split scored as well as the real one
    # and the last note won by rounding. A mean makes that contamination cost something, which is
    # the whole point of choosing where the line goes.
    for index in range(2, len(ordered)):
        below = float(np.mean(values[:index]))
        above = float(np.mean(values[index:]))
        if above - below > best_jump:
            best_index, best_jump = index, above - below
    if best_index < 0 or best_jump < PASSAGGIO_H1H2_JUMP_DB:
        return
    for note in ordered[best_index:]:
        note.register = "falsetto"


def _segment_notes(f0: np.ndarray, times: np.ndarray, voiced: np.ndarray,
                   y: np.ndarray, sr: int) -> list[Note]:
    """Held notes, in the order they were sung.

    A scale is structured in a way a song is not: the singer stops on each step. That structure is
    worth using. A percentile over the whole take would rank a single octave-error from the tracker
    alongside a note the singer actually held, and at the top of a range -- exactly where the
    reading matters -- one such frame moves the answer by twelve semitones.
    """
    notes: list[Note] = []
    index = 0
    while index < len(voiced):
        if not voiced[index]:
            index += 1
            continue
        start = index
        while index < len(voiced) and voiced[index]:
            index += 1
        if times[index - 1] - times[start] < MIN_NOTE_SECONDS:
            continue
        # Trim the onset and release: a singer slides into a note and falls off the end of it, and
        # neither part is the note.
        span = index - start
        core = f0[start + span // 5 : index - span // 5]
        core = core[np.isfinite(core)]
        if core.size < 3:
            continue
        hz = float(np.median(core))
        wobble = 12.0 * float(np.log2(core.max() / core.min())) if core.min() > 0 else 99.0
        if wobble > MAX_NOTE_WOBBLE_SEMITONES:
            continue
        # Read the harmonics off the same stable middle the pitch came from, not the onset.
        begin, finish = float(times[start]), float(times[index - 1])
        inset = (finish - begin) / 5.0
        segment = y[int((begin + inset) * sr):int((finish - inset) * sr)]
        notes.append(Note(begin, finish, hz, _h1_h2_db(segment, sr, hz)))
    return notes


def analyse_scale(path: Path, comfort_hz: float = 0.0) -> ScaleStats:
    """Range from a call-and-response scale take.

    `comfort_hz` is the reference tone that was sounding when the singer said it had started to
    hurt. It comes from the client because it is exact there -- the browser played that frequency --
    and because comfort is a judgement only the singer can make. Nothing acoustic is a reliable
    proxy for it.
    """
    import librosa

    y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    duration = float(len(y)) / sr if sr else 0.0
    hop = 256
    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=70, fmax=1200, sr=sr, frame_length=1024, hop_length=hop,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop)
    voiced = np.isfinite(f0) & voiced_flag
    notes = _segment_notes(f0, times, voiced, y, sr)

    if not notes:
        return ScaleStats(duration, [], 0.0, 0.0, 0.0)

    _split_registers(notes)
    pitches = [note.hz for note in notes]
    low = min(pitches)
    absolute = max(pitches)
    modal = [n.hz for n in notes if n.register == "modal"]
    falsetto = [n.hz for n in notes if n.register == "falsetto"]
    # The singer can stop before straining, so comfort is normally below the top note. Trust the
    # marker, but it cannot sit above a note that was never reached.
    comfort = min(comfort_hz, absolute) if comfort_hz > 0 else absolute
    return ScaleStats(duration, notes, low, comfort, absolute,
                      max(modal) if modal else 0.0,
                      max(falsetto) if falsetto else 0.0)


def scale_windows(stats: ScaleStats, total_seconds: float, ceiling_hz: float = 0.0
                  ) -> list[tuple[float, float]]:
    """(start, length) windows over the scale, spread evenly across the registers sung.

    Notes above `ceiling_hz` are dropped. Past the comfort marker the singer is straining, and a
    model fine-tuned on that learns the strain as part of who they are.
    """
    # Falsetto is left out of the reference clip entirely. It is a different timbre from the same
    # person, and a clip that mixes the two teaches the model to blur them together.
    usable = [n for n in stats.notes
              if n.register == "modal" and (ceiling_hz <= 0 or n.hz <= ceiling_hz * 1.03)]
    if not usable:
        return []
    usable.sort(key=lambda n: n.hz)
    # Evenly across the register, not across time: the point of the clip is pitch coverage.
    budget = total_seconds
    picks: list[tuple[float, float]] = []
    wanted = max(1, min(len(usable), int(total_seconds // 1.2)))
    for fraction in np.linspace(0.0, 1.0, wanted):
        note = usable[min(len(usable) - 1, int(fraction * (len(usable) - 1)))]
        length = min(budget, note.end - note.start)
        if length < 0.3:
            continue
        window = (note.start, length)
        if window in picks:
            continue
        picks.append(window)
        budget -= length
        if budget <= 0.3:
            break
    return [(start, length) for start, length in sorted(picks)]


def analyse(path: Path) -> RecordingStats:
    import librosa

    y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    duration = float(len(y)) / sr if sr else 0.0
    rms = float(np.sqrt(np.mean(np.square(y)))) if y.size else 0.0
    rms_db = 20.0 * float(np.log10(max(rms, 1e-9)))

    hop = 256
    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=70, fmax=1000, sr=sr, frame_length=1024, hop_length=hop,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop)
    voiced = np.isfinite(f0) & voiced_flag
    ratio = float(voiced.mean()) if voiced.size else 0.0

    if voiced.sum() < 20:
        return RecordingStats(duration, ratio, rms_db, 0.0, 0.0, 0.0, 0.0, 0.0, times, f0)

    values = f0[voiced]
    # 98th rather than the maximum: one cracked note or one octave-error from the tracker should
    # not define where a singer's ceiling is.
    low, median, high, peak = (float(v) for v in np.percentile(values, [10, 50, 90, 98]))
    span = 12.0 * float(np.log2(high / low)) if low > 0 else 0.0
    return RecordingStats(duration, ratio, rms_db, low, median, high, peak, span, times, f0)


def validate(stats: RecordingStats) -> str | None:
    """A Korean sentence the owner can act on, or None when the take is usable."""
    if stats.duration < MIN_DURATION:
        return f"녹음이 {stats.duration:.0f}초밖에 안 돼요. 30초 이상 불러주세요."
    if stats.rms_db < MIN_RMS_DB:
        return "소리가 너무 작아요. 마이크에 가까이서 다시 불러주세요."
    if stats.voiced_ratio < MIN_VOICED_RATIO:
        return "노래하는 소리를 거의 찾지 못했어요. 조용한 곳에서 다시 녹음해 주세요."
    if stats.span_semitones < MIN_SPAN_SEMITONES:
        return (
            "음이 거의 한 높이에 머물러 있어요. 같은 곡을 낮은 키로 한 번, "
            "높은 키로 한 번 불러주세요."
        )
    return None


def reference_windows(stats: RecordingStats, total_seconds: float = 21.0,
                      parts: int = 3) -> list[tuple[float, float]]:
    """(start, length) windows covering the low, middle and high of what was actually sung.

    Seed-VC copies timbre from this clip, so it decides which register the voice sounds right in.
    Cutting it from the first 22 seconds meant cutting it from the low take alone.
    """
    voiced = np.isfinite(stats.f0)
    if stats.duration <= total_seconds or voiced.sum() < 20:
        return [(0.0, min(total_seconds, stats.duration))]

    length = total_seconds / parts
    # Median pitch of each candidate window, so windows are ranked by register rather than time.
    step = length / 2.0
    candidates: list[tuple[float, float]] = []
    start = 0.0
    while start + length <= stats.duration:
        mask = voiced & (stats.times >= start) & (stats.times < start + length)
        if mask.sum() >= 10:
            candidates.append((float(np.median(stats.f0[mask])), start))
        start += step

    if len(candidates) < parts:
        return [(0.0, min(total_seconds, stats.duration))]

    candidates.sort()
    picks: list[float] = []
    for fraction in np.linspace(0.1, 0.9, parts):
        target = min(len(candidates) - 1, int(len(candidates) * fraction))
        # Windows overlap by design (they step by half a length), so walk outwards from the wanted
        # register until one lands clear of what is already picked. Otherwise the reference can
        # repeat the same two seconds three times.
        for offset in range(len(candidates)):
            for index in {target - offset, target + offset}:
                if not 0 <= index < len(candidates):
                    continue
                start = candidates[index][1]
                if all(abs(start - chosen) >= length for chosen in picks):
                    picks.append(start)
                    break
            else:
                continue
            break

    # Play them back in time order so the clip sounds like one continuous take.
    return [(start, length) for start in sorted(picks)]
