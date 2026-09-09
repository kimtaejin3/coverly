"""Run the same pipeline on a real cloud GPU to get the numbers PRD §54 asks for.

    pip install modal && modal setup
    COVERLY_GPU=L4 modal run modal_benchmark.py --inputs samples/a.mp3,samples/b.mp3 --voice voices/x.wav

UNVERIFIED: written without a Modal account in this environment; expect to fix small things on
first run. Everything (demucs + seed-vc deps) is installed into ONE image python here; the local
two-venv split is only a laptop convenience. Model weights are downloaded at image build time so
the measured time excludes downloads (container cold start is reported separately as round-trip).
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

import modal

GPU = os.environ.get("COVERLY_GPU", "L4")
SEED_VC_DIR = "/opt/seed-vc"
REQS = Path(__file__).parent / "scripts" / "seedvc-requirements.txt"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install_from_requirements(str(REQS))
    .pip_install("demucs==4.1.0")
    # Modal injects its client into the container at /pkg and it imports google.protobuf from the
    # image. transformers 4.46 pulls an old protobuf whose enum wrappers lack `.ValueType`, which
    # crashes `import modal` inside the container, so pin a version new enough for the client.
    .pip_install("protobuf>=5.27,<7")
    .run_commands(
        f"git clone --depth 1 https://github.com/Plachtaa/seed-vc.git {SEED_VC_DIR}",
        # warm caches: demucs weights + seed-vc checkpoints (whisper, DiT, BigVGAN, campplus, rmvpe)
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs')\"",
        f"cd {SEED_VC_DIR} && python inference.py --source examples/source/source_s1.wav "
        f"--target examples/reference/s1p1.wav --output /tmp/warm --diffusion-steps 1 "
        f"--f0-condition True --fp16 False",
    )
    .add_local_python_source("coverly_worker")
)

app = modal.App("coverly-phase0-benchmark", image=image)


@app.function(gpu=GPU, timeout=60 * 30)
def generate_remote(song: bytes, song_name: str, voice: bytes, start: float, duration: float,
                    diffusion_steps: int, pitch_shift: int = 0, auto_f0_adjust: bool = False,
                    return_stems: bool = False) -> dict:
    from coverly_worker.pipeline import GenerationRequest, run_generation
    from coverly_worker.separation import DemucsSeparator
    from coverly_worker.voice_conversion import SeedVCProvider

    work = Path("/tmp/job")
    work.mkdir(exist_ok=True)
    song_path = work / song_name
    song_path.write_bytes(song)
    voice_path = work / "voice.wav"
    voice_path.write_bytes(voice)
    out = work / "cover.mp3"
    started = time.time()
    result = run_generation(
        GenerationRequest(input_path=song_path, voice_id=str(voice_path), output_path=out,
                          start=start, duration=None if duration <= 0 else duration,
                          pitch_shift=pitch_shift, work_dir=work / "wd", keep_work=True),
        DemucsSeparator(device="cuda", python=sys.executable),
        SeedVCProvider(repo_dir=Path(SEED_VC_DIR), python=Path(sys.executable),
                       diffusion_steps=diffusion_steps, device="cuda",
                       auto_f0_adjust=auto_f0_adjust),
        device="cuda",
    )
    payload = {"metrics": result.metrics.to_dict(), "wall_seconds": time.time() - started,
               "mp3": out.read_bytes()}
    if return_stems and result.work_dir:
        # the isolated converted vocal is what you listen to when judging the model itself,
        # without the instrumental masking its artefacts
        conv = sorted((result.work_dir / "seedvc_out").glob("*.wav"))
        if conv:
            payload["converted_vocal"] = conv[-1].read_bytes()
    return payload


@app.local_entrypoint()
def main(inputs: str, voice: str, start: float = 30.0, duration: float = 30.0,
         diffusion_steps: int = 30, pitch_shifts: str = "0", auto_f0_adjust: bool = False,
         stems: bool = False, tag: str = ""):
    """Cartesian product of songs x voices x pitch shifts, run in parallel.

    `inputs`, `voice` and `pitch_shifts` are comma-separated lists.
    """
    from coverly_worker.metrics import estimate_cost

    out_dir = Path("bench_out") / f"modal-{GPU}{('-' + tag) if tag else ''}"
    out_dir.mkdir(parents=True, exist_ok=True)
    songs = [Path(raw.strip()) for raw in inputs.split(",")]
    voices = [Path(raw.strip()) for raw in voice.split(",")]
    pitches = [int(raw.strip()) for raw in pitch_shifts.split(",")]
    voice_tag = "+".join(v.stem for v in voices)
    # starmap fans the jobs out across containers (Starter allows 10 concurrent GPUs), so N jobs
    # cost the same GPU-seconds as one-by-one but finish in roughly the time of a single job.
    combos, args = [], []
    for song in songs:
        for v in voices:
            for pitch in pitches:
                combos.append((song, v, pitch))
                args.append((song.read_bytes(), song.name, v.read_bytes(), start, duration,
                             diffusion_steps, pitch, auto_f0_adjust, stems))
    print(f"running {len(args)} jobs: {len(songs)} songs x {len(voices)} voices x {len(pitches)} pitches")
    t0 = time.time()
    results = list(generate_remote.starmap(args))
    batch_seconds = time.time() - t0
    rows = []
    for (song, v, pitch), res in zip(combos, results):
        suffix = f"{song.stem}__{v.stem}__p{pitch}{'_autof0' if auto_f0_adjust else ''}"
        (out_dir / f"{suffix}.mp3").write_bytes(res.pop("mp3"))
        if "converted_vocal" in res:
            (out_dir / f"{suffix}__vocalonly.wav").write_bytes(res.pop("converted_vocal"))
        res.update(input=str(song), voice=v.stem, pitch_shift=pitch, auto_f0_adjust=auto_f0_adjust)
        rows.append(res)
        print(f"{suffix}: total {res['metrics']['total_seconds']:.1f}s")
    print(f"batch of {len(args)} finished in {batch_seconds:.1f}s wall clock")
    mean_total = statistics.fmean(r["metrics"]["total_seconds"] for r in rows)
    cost = estimate_cost(mean_total, gpu=GPU)
    (out_dir / f"results_{voice_tag}.json").write_text(
        json.dumps({"gpu": GPU, "voice": voice_tag, "rows": rows, "cost": cost.__dict__}, indent=2))
    print(f"\nmean total {mean_total:.1f}s on {GPU} → ${cost.usd:.4f} ≈ {cost.krw:.0f} KRW per generation")
