"""The GPU worker: it drains `generation_jobs` and writes finished covers back to Supabase.

Two ways in, on purpose:

  * `enqueue` — a web endpoint the Next.js API calls the moment a job is created, so a user does
    not wait for a poll interval.
  * `sweep` — a schedule that claims anything still queued. If the HTTP call above is lost, or a
    container dies mid-job, the work is still picked up rather than stranded.

Deploy:  modal deploy modal_worker.py
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import modal

GPU = os.environ.get("COVERLY_GPU", "L4")
SEED_VC_DIR = "/opt/seed-vc"
SING_CONFIG = f"{SEED_VC_DIR}/configs/presets/config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"
WORKER = Path(__file__).parent
REQS = WORKER / "scripts" / "seedvc-requirements.txt"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements(str(REQS))
    # yt-dlp is deliberately unpinned: YouTube changes its player regularly and stale versions
    # fail on parsing alone, so the image should pick up the newest release at build time.
    .pip_install("demucs==4.1.0", "protobuf>=5.27,<7", "httpx>=0.27", "yt-dlp",
                 "fastapi[standard]")
    .run_commands(
        f"git clone --depth 1 https://github.com/Plachtaa/seed-vc.git {SEED_VC_DIR}",
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs_ft')\"",
        f"cd {SEED_VC_DIR} && python inference.py --source examples/source/source_s1.wav "
        f"--target examples/reference/s1p1.wav --output /tmp/warm --diffusion-steps 1 "
        f"--f0-condition True --fp16 False",
    )
    .add_local_python_source("coverly_worker")
)

app = modal.App("coverly-worker", image=image)
models = modal.Volume.from_name("coverly-voice-models", create_if_missing=True)
secrets = [modal.Secret.from_name("coverly-supabase"), modal.Secret.from_name("coverly-mail")]

VOICES_DIR = Path("/models/_voices")


def _build_components(voice, device: str):
    """Pick the conversion provider for this voice.

    A fine-tuned checkpoint is what makes the voice sound like itself across its whole range, so
    it is used whenever the voice has one; without it we fall back to zero-shot from the sample.
    """
    import sys

    from coverly_worker.separation import DemucsSeparator
    from coverly_worker.voice_conversion import SeedVCProvider

    checkpoint = config = None
    if voice and voice.model_reference:
        model_dir = Path("/models") / voice.model_reference
        ckpt, cfg = model_dir / "ft_model.pth", model_dir / "config.yml"
        if ckpt.exists() and cfg.exists():
            checkpoint, config = ckpt, cfg

    provider = SeedVCProvider(
        repo_dir=Path(SEED_VC_DIR),
        python=Path(sys.executable),
        voices_dir=VOICES_DIR,
        diffusion_steps=50,
        # Guidance strength. 0.7 is the repo default; leaning on the reference harder is what
        # makes a fine-tuned voice keep its own colour instead of drifting to the source singer.
        inference_cfg_rate=0.8,
        device=device,
        checkpoint=checkpoint,
        config=config,
    )
    return (
        DemucsSeparator(device=device, python=sys.executable, model="htdemucs_ft", shifts=2),
        provider,
    )


@app.function(gpu=GPU, timeout=60 * 30, volumes={"/models": models}, secrets=secrets,
              max_containers=4)
def process_cover(cover_id: str) -> dict:
    from coverly_worker.backend import Backend
    from coverly_worker.runner import process_job

    backend = Backend()
    job = backend.job_for_cover(cover_id)
    if job is None:
        return {"cover_id": cover_id, "skipped": "no job row"}

    voice = backend.load_voice(job.voice_id)
    separator, provider = _build_components(voice, "cuda")

    # The reference clip lives beside the checkpoint in the volume, named by voice id.
    started = time.time()
    reference = VOICES_DIR / f"{job.voice_id}.wav"
    result_path = process_job(
        job, backend, separator, provider,
        worker_id=os.environ.get("MODAL_TASK_ID", "modal"),
        device="cuda", gpu_type=GPU,
        reference_path=reference if reference.exists() else None,
    )
    return {"cover_id": cover_id, "result": result_path, "seconds": time.time() - started}


def notify_owner(backend, user_id: str | None, *, ready: bool, reason: str = "") -> None:
    """Tell the owner their voice is done. Twenty minutes is longer than anyone waits on a page."""
    if not user_id:
        return
    try:
        from coverly_worker.mail import voice_failed_mail, voice_ready_mail

        to = backend.user_email(user_id)
        if not to:
            return
        voice_ready_mail(to) if ready else voice_failed_mail(to, reason)
    except Exception as exc:  # noqa: BLE001 - never let a notification change the outcome
        print(f"notify failed: {exc}")


@app.function(gpu=GPU, timeout=60 * 60, volumes={"/models": models}, secrets=secrets,
              max_containers=2)
def train_voice(voice_id: str, steps: int = 0) -> dict:
    """Fine-tune a personal voice from the recording its owner made.

    Runs the same path as the catalogue voices, just from a much shorter recording: split into
    clips, fine-tune, and leave the checkpoint plus the reference clip in the volume where
    `process_cover` looks for them.
    """
    import re
    import subprocess
    import sys
    import tempfile
    import time as _time

    from coverly_worker.audio import probe_duration, trim
    from coverly_worker.backend import Backend
    from coverly_worker.recording import analyse, reference_windows, validate

    backend = Backend()

    def report(stage: str, progress: int, **extra) -> None:
        backend._rest("PATCH", "voices", params={"id": f"eq.{voice_id}"},  # noqa: SLF001
                      json={"training_stage": stage, "training_progress": progress, **extra})

    rows = backend._rest("GET", "voices", params={  # noqa: SLF001 - worker-only module
        "id": f"eq.{voice_id}", "select": "id,training_audio_url,owner_user_id"})
    if not rows or not rows[0].get("training_audio_url"):
        return {"voice_id": voice_id, "skipped": "no training audio"}
    owner = rows[0].get("owner_user_id")

    report("준비 중", 2, status="training", error_message=None)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            raw = backend.download("uploads", rows[0]["training_audio_url"], work / "raw.webm")

            # Normalise whatever the browser recorded into what the trainer expects.
            source = work / "voice.wav"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                            "-ac", "1", "-ar", "44100",
                            "-af", "highpass=f=70,loudnorm=I=-18:TP=-2:LRA=11",
                            str(source)], check=True)

            # Listen to the take before spending a GPU on it. A silent, spoken or monotone
            # recording cannot produce a usable voice, and finding that out after twenty minutes
            # helps nobody.
            report("녹음 확인 중", 5)
            stats = analyse(source)
            complaint = validate(stats)
            if complaint:
                raise ValueError(complaint)

            duration = probe_duration(source)
            data_dir = work / "clips"
            data_dir.mkdir()
            offset, index = 0.0, 0
            while duration - offset >= 3.0:
                length = min(15.0, duration - offset)
                index += 1
                trim(source, data_dir / f"{voice_id}_{index:03d}.wav", offset, length, channels=1)
                offset += length
            clip_count = index

            # A short recording overfits long before 1500 steps. Scale with what was actually sung
            # and keep it inside a range that stays under the container timeout.
            total_steps = steps or max(600, min(1500, clip_count * 180))

            report("학습 중", 10)
            started = _time.time()
            proc = subprocess.Popen(
                [sys.executable, "-u", "train.py", "--config", SING_CONFIG,
                 "--dataset-dir", str(data_dir), "--run-name", voice_id,
                 "--batch-size", "2", "--max-steps", str(total_steps), "--max-epochs", "1000",
                 "--save-every", "500", "--num-workers", "0"],
                cwd=SEED_VC_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            tail: list[str] = []
            last_report = 0.0
            for line in proc.stdout or []:
                tail.append(line)
                del tail[:-40]
                # train.py logs "epoch N, step M, loss: ..."; M is the only real progress signal.
                match = re.search(r"step (\d+)", line)
                if match and _time.time() - last_report > 20:
                    done = min(1.0, int(match.group(1)) / total_steps)
                    report("학습 중", 10 + int(done * 80))
                    last_report = _time.time()
            if proc.wait() != 0:
                raise RuntimeError(f"training failed: {''.join(tail)[-400:]}")

            run_dir = Path(SEED_VC_DIR) / "runs" / voice_id
            ckpt = run_dir / "ft_model.pth"
            if not ckpt.exists():
                raise RuntimeError("training produced no checkpoint")

            report("마무리 중", 92)
            dest = Path("/models") / voice_id
            dest.mkdir(parents=True, exist_ok=True)
            staged = dest / "ft_model.pth.new"
            staged.write_bytes(ckpt.read_bytes())
            staged.replace(dest / "ft_model.pth")
            (dest / "config.yml").write_bytes(Path(SING_CONFIG).read_bytes())
            info = {"train_seconds": _time.time() - started}

            # The provider copies timbre from the reference, so it must land beside the checkpoint
            # -- and it must span the singer. Cutting the first 22 seconds captured only whichever
            # key they started in, which is the whole reason the catalogue voices sounded wrong
            # outside one octave.
            windows = reference_windows(stats)
            parts = []
            for n, (start, length) in enumerate(windows):
                part = work / f"ref{n}.wav"
                trim(source, part, start, length, channels=1)
                parts.append(part)
            reference = work / "reference.wav"
            if len(parts) == 1:
                reference = parts[0]
            else:
                listing = work / "ref.txt"
                listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                                "-i", str(listing), "-ac", "1", "-ar", "44100", str(reference)],
                               check=True)

            VOICES_DIR.mkdir(parents=True, exist_ok=True)
            (VOICES_DIR / f"{voice_id}.wav").write_bytes(reference.read_bytes())
            models.commit()

        backend._rest("PATCH", "voices", params={"id": f"eq.{voice_id}"},  # noqa: SLF001
                      json={"status": "ready", "model_reference": voice_id, "is_active": True,
                            "training_progress": 100, "training_stage": None,
                            "f0_low": round(stats.f0_low, 2),
                            "f0_median": round(stats.f0_median, 2),
                            "f0_high": round(stats.f0_high, 2),
                            "f0_peak": round(stats.f0_peak, 2)})
        notify_owner(backend, owner, ready=True)
        return {"voice_id": voice_id, "clips": clip_count, "steps": total_steps,
                "range_semitones": round(stats.span_semitones, 1),
                "train_seconds": info["train_seconds"]}
    except Exception as exc:  # noqa: BLE001 - the owner has to learn why their voice failed
        backend._rest("PATCH", "voices", params={"id": f"eq.{voice_id}"},  # noqa: SLF001
                      json={"status": "failed", "error_message": str(exc)[:400],
                            "training_progress": 0, "training_stage": None})
        notify_owner(backend, owner, ready=False, reason=str(exc)[:200])
        # A recording we rejected is an ordinary outcome and its message is already in the row;
        # anything else is a real fault and should surface in the Modal logs.
        if isinstance(exc, ValueError):
            return {"voice_id": voice_id, "rejected": str(exc)}
        raise


@app.function(secrets=secrets, timeout=60)
@modal.fastapi_endpoint(method="POST")
def train(payload: dict):
    """Called by the web app after a recording is uploaded."""
    from fastapi import HTTPException

    expected = os.environ.get("WORKER_SHARED_SECRET", "")
    if not expected or payload.get("secret") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    voice_id = str(payload.get("voiceId") or "")
    if not voice_id:
        raise HTTPException(status_code=400, detail="voiceId required")

    train_voice.spawn(voice_id)
    return {"accepted": True, "voiceId": voice_id}


@app.function(secrets=secrets, timeout=60 * 10, cpu=2.0, memory=4096)
def resolve_youtube(url: str, user_id: str) -> dict:
    """Fetch a YouTube link's audio up front so the browser can play it before generating.

    CPU only — this is a download and a transcode, not inference. The audio lands in the same
    private `uploads` bucket an upload would, so the generation path afterwards is identical and
    nothing is fetched twice.
    """
    import tempfile
    import uuid

    from coverly_worker.audio import probe_duration
    from coverly_worker.backend import Backend
    from coverly_worker.runner import _download_youtube

    backend = Backend()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        audio = _download_youtube(url, work)
        duration = probe_duration(audio)
        # Long uploads are not previews; refuse before spending storage on them.
        if duration > 15 * 60:
            raise ValueError("영상이 너무 깁니다. 15분 이하만 가져올 수 있어요.")
        path = f"{user_id}/yt-{uuid.uuid4().hex[:12]}{audio.suffix}"
        backend.upload("uploads", path, audio, content_type="audio/mpeg")
    return {"path": path, "durationSeconds": duration}


@app.function(secrets=secrets, timeout=60 * 10)
@modal.fastapi_endpoint(method="POST")
def resolve(payload: dict):
    """Called by the web app when a user pastes a link and asks to fetch it."""
    from fastapi import HTTPException

    expected = os.environ.get("WORKER_SHARED_SECRET", "")
    if not expected or payload.get("secret") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    url = str(payload.get("url") or "")
    user_id = str(payload.get("userId") or "")
    if not url or not user_id:
        raise HTTPException(status_code=400, detail="url and userId required")

    try:
        return resolve_youtube.remote(url, user_id)
    except Exception as exc:  # noqa: BLE001 - surface a usable message, not a stack trace
        raise HTTPException(status_code=422, detail=str(exc)[:200])


@app.function(secrets=secrets, timeout=60)
@modal.fastapi_endpoint(method="POST")
def enqueue(payload: dict):
    """Called by the web app right after it creates a job.

    Shared-secret authenticated: without it, anyone could make us run GPU work on arbitrary ids.
    Returns as soon as the GPU call is spawned so the API never waits on inference.
    """
    from fastapi import HTTPException

    expected = os.environ.get("WORKER_SHARED_SECRET", "")
    if not expected or payload.get("secret") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    cover_id = str(payload.get("coverId") or "")
    if not cover_id:
        raise HTTPException(status_code=400, detail="coverId required")

    process_cover.spawn(cover_id)
    return {"accepted": True, "coverId": cover_id}


@app.function(schedule=modal.Period(minutes=2), secrets=secrets, timeout=60 * 5)
def sweep() -> dict:
    """Safety net for jobs the enqueue call never reached."""
    from coverly_worker.backend import Backend

    backend = Backend()
    queued = backend._rest(  # noqa: SLF001 - internal helper, worker-only module
        "GET", "generation_jobs",
        params={"status": "eq.queued", "order": "created_at.asc", "limit": "10", "select": "cover_id"},
    ) or []
    for row in queued:
        process_cover.spawn(row["cover_id"])

    # Same safety net for personal voices: the web app fires the train endpoint and forgets, so a
    # dropped request would otherwise leave the owner watching a spinner that never resolves.
    stale = backend._rest(  # noqa: SLF001
        "GET", "voices",
        params={"status": "eq.queued", "owner_user_id": "not.is.null",
                "order": "created_at.asc", "limit": "3", "select": "id"},
    ) or []
    for row in stale:
        train_voice.spawn(row["id"])

    return {"spawned": len(queued), "training": len(stale)}
