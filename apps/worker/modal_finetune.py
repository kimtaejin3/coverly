"""Fine-tune Seed-VC on one voice, then generate covers with the fine-tuned model.

Zero-shot Seed-VC copies timbre from a single 22-second reference, so it only learns how the voice
sounds at the pitches that clip happens to contain. Covering a song that sits lower than the
reference leaves the model guessing, which is audible as a wrong voice in the normal register.
Fine-tuning shows the model minutes of the voice across its range instead.

    # 1. build the dataset locally
    uv run python make_voice.py --input iu.mp3 --name iu --match bss.mp3 --dataset
    # 2. train (a few minutes on an L4) and generate in the same container
    COVERLY_GPU=L4 uv run modal run modal_finetune.py --voice-name iu \
        --sections work/sections/bss_s090.mp3 --steps 1000
"""
from __future__ import annotations

import json
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
    .pip_install("demucs==4.1.0", "protobuf>=5.27,<7", "tqdm", "tensorboard")
    .run_commands(
        f"git clone --depth 1 https://github.com/Plachtaa/seed-vc.git {SEED_VC_DIR}",
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"",
        f"cd {SEED_VC_DIR} && python inference.py --source examples/source/source_s1.wav "
        f"--target examples/reference/s1p1.wav --output /tmp/warm --diffusion-steps 1 "
        f"--f0-condition True --fp16 False",
    )
    .add_local_python_source("coverly_worker")
)

app = modal.App("coverly-seedvc-finetune", image=image)
# The trained checkpoint has to outlive the training container so inference can reuse it.
models = modal.Volume.from_name("coverly-voice-models", create_if_missing=True)


@app.function(gpu=GPU, timeout=60 * 60, volumes={"/models": models})
def finetune(voice_name: str, clips: list[tuple[str, bytes]], steps: int = 1000,
             batch_size: int = 2, save_every: int = 500) -> dict:
    import subprocess
    import sys

    data_dir = Path("/tmp/dataset")
    data_dir.mkdir(parents=True, exist_ok=True)
    for name, blob in clips:
        (data_dir / name).write_bytes(blob)
    print(f"dataset: {len(clips)} clips in {data_dir}")

    started = time.time()
    cmd = [sys.executable, "train.py", "--config", SING_CONFIG, "--dataset-dir", str(data_dir),
           "--run-name", voice_name, "--batch-size", str(batch_size), "--max-steps", str(steps),
           "--max-epochs", "1000", "--save-every", str(save_every), "--num-workers", "0"]
    proc = subprocess.run(cmd, cwd=SEED_VC_DIR, capture_output=True, text=True)
    train_seconds = time.time() - started
    if proc.returncode != 0:
        raise RuntimeError(f"training failed ({proc.returncode})\n{proc.stdout[-3000:]}\n{proc.stderr[-5000:]}")

    run_dir = Path(SEED_VC_DIR) / "runs" / voice_name
    produced = sorted(p.name for p in run_dir.glob("*"))
    ckpt = run_dir / "ft_model.pth"
    if not ckpt.exists():
        raise RuntimeError(f"no ft_model.pth in {run_dir}; found {produced}")

    dest = Path("/models") / voice_name
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "ft_model.pth").write_bytes(ckpt.read_bytes())
    (dest / "config.yml").write_bytes(Path(SING_CONFIG).read_bytes())
    models.commit()
    return {"train_seconds": train_seconds, "steps": steps, "clips": len(clips),
            "run_dir_contents": produced, "tail": proc.stdout[-1500:]}


@app.function(gpu=GPU, timeout=60 * 30, volumes={"/models": models})
def generate_finetuned(voice_name: str, song: bytes, song_name: str, reference: bytes,
                       start: float, duration: float, diffusion_steps: int = 50,
                       pitch_shift: int = 0, use_finetuned: bool = True) -> dict:
    import sys

    from coverly_worker.pipeline import GenerationRequest, run_generation
    from coverly_worker.separation import DemucsSeparator
    from coverly_worker.voice_conversion import SeedVCProvider

    work = Path("/tmp/job")
    work.mkdir(exist_ok=True)
    song_path = work / song_name
    song_path.write_bytes(song)
    ref_path = work / "reference.wav"
    ref_path.write_bytes(reference)
    out = work / "cover.mp3"

    ckpt = cfg = None
    if use_finetuned:
        model_dir = Path("/models") / voice_name
        ckpt, cfg = model_dir / "ft_model.pth", model_dir / "config.yml"
        if not ckpt.exists():
            raise RuntimeError(f"no fine-tuned model for {voice_name}; run finetune first")

    result = run_generation(
        GenerationRequest(input_path=song_path, voice_id=str(ref_path), output_path=out,
                          start=start, duration=None if duration <= 0 else duration,
                          pitch_shift=pitch_shift, work_dir=work / "wd", keep_work=True),
        DemucsSeparator(device="cuda", python=sys.executable),
        SeedVCProvider(repo_dir=Path(SEED_VC_DIR), python=Path(sys.executable),
                       diffusion_steps=diffusion_steps, device="cuda",
                       checkpoint=ckpt, config=cfg),
        device="cuda",
    )
    payload = {"metrics": result.metrics.to_dict(), "mp3": out.read_bytes(),
               "finetuned": use_finetuned}
    conv = sorted((result.work_dir / "seedvc_out").glob("*.wav"))
    if conv:
        payload["converted_vocal"] = conv[-1].read_bytes()
    return payload


@app.local_entrypoint()
def main(voice_name: str, sections: str, steps: int = 1000, diffusion_steps: int = 50,
         pitch_shift: int = 0, skip_training: bool = False, compare: bool = True,
         start: float = 0.0, duration: float = 30.0):
    """Train `voice_name` from datasets/<voice_name>/, then convert each section with it."""
    dataset_dir = WORKER / "datasets" / voice_name
    reference = WORKER / "voices" / f"{voice_name}.wav"
    clips = sorted(dataset_dir.glob("*.wav"))
    if not clips:
        raise SystemExit(f"no clips in {dataset_dir}; run make_voice.py --dataset first")
    if not reference.is_file():
        raise SystemExit(f"missing reference {reference}")

    out_dir = WORKER / "bench_out" / f"modal-{GPU}-ft-{voice_name}"
    out_dir.mkdir(parents=True, exist_ok=True)

    if not skip_training:
        print(f"training {voice_name} on {len(clips)} clips for {steps} steps ...")
        info = finetune.remote(voice_name, [(c.name, c.read_bytes()) for c in clips], steps)
        print(f"  trained in {info['train_seconds']:.0f}s -> {info['run_dir_contents']}")
        (out_dir / "training.json").write_text(json.dumps(info, indent=2))

    ref_bytes = reference.read_bytes()
    songs = [Path(p.strip()) for p in sections.split(",")]
    variants = [True, False] if compare else [True]
    args = [(voice_name, s.read_bytes(), s.name, ref_bytes, start, duration, diffusion_steps,
             pitch_shift, ft) for s in songs for ft in variants]
    print(f"generating {len(args)} clips ...")
    results = list(generate_finetuned.starmap(args))
    for (song, ft), res in zip([(s, v) for s in songs for v in variants], results):
        tag = "finetuned" if ft else "zeroshot"
        stem = f"{song.stem}__{voice_name}__{tag}"
        (out_dir / f"{stem}.mp3").write_bytes(res.pop("mp3"))
        if "converted_vocal" in res:
            (out_dir / f"{stem}__vocalonly.wav").write_bytes(res.pop("converted_vocal"))
        print(f"  {stem}: {res['metrics']['total_seconds']:.1f}s")
    print(f"\noutputs in {out_dir}")


@app.local_entrypoint()
def main_batch(voices: str, steps: int = 1000):
    """Fine-tune several voices in one go and put each reference beside its checkpoint.

        modal run modal_finetune.py::main_batch --voices aria,nova,lumi,juno,kai,rune

    The reference clip has to live in the volume too: the worker loads the checkpoint from
    `/models/<voice>` and the reference from `/models/_voices/<voice>.wav`, so shipping only the
    checkpoint would leave the provider with nothing to copy timbre from.
    """
    names = [n.strip() for n in voices.split(",") if n.strip()]
    jobs = []
    for name in names:
        clips = sorted((WORKER / "datasets" / name).glob("*.wav"))
        reference = WORKER / "voices" / f"{name}.wav"
        if not clips or not reference.is_file():
            print(f"skip {name}: {len(clips)} clips, reference={reference.is_file()}")
            continue
        jobs.append((name, [(c.name, c.read_bytes()) for c in clips], steps))
        print(f"queued {name}: {len(clips)} clips")

    if not jobs:
        raise SystemExit("nothing to train")

    print(f"\ntraining {len(jobs)} voices x {steps} steps ...")
    for info, (name, _, _) in zip(finetune.starmap(jobs), jobs):
        print(f"  {name}: {info['train_seconds']:.0f}s -> {info['run_dir_contents']}")

    # Upload every reference clip after training so the volume is complete in one pass.
    put_references.remote([(n, (WORKER / "voices" / f"{n}.wav").read_bytes()) for n, _, _ in jobs])
    print("references uploaded")


@app.function(volumes={"/models": models}, timeout=60 * 10)
def put_references(items: list[tuple[str, bytes]]) -> list[str]:
    directory = Path("/models/_voices")
    directory.mkdir(parents=True, exist_ok=True)
    for name, data in items:
        (directory / f"{name}.wav").write_bytes(data)
    models.commit()
    return sorted(p.name for p in directory.iterdir())
