#!/usr/bin/env bash
# Fine-tune Seed-VC on one voice using the local machine (MPS on Apple Silicon, else CUDA).
#   ./scripts/finetune_local.sh iu 1000
# Produces vendor/seed-vc/runs/<voice>/ft_model.pth plus the config it was trained with.
set -euo pipefail
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE="${1:?usage: finetune_local.sh <voice-name> [steps]}"
STEPS="${2:-1000}"
DATASET="$WORKER_DIR/datasets/$VOICE"
SEED_VC="$WORKER_DIR/vendor/seed-vc"
CONFIG="configs/presets/config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"

[ -d "$DATASET" ] || { echo "no dataset at $DATASET (run make_voice.py --dataset first)" >&2; exit 1; }
echo "training '$VOICE' on $(ls "$DATASET" | wc -l | tr -d ' ') clips for $STEPS steps"
cd "$SEED_VC"
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python train.py \
  --config "$CONFIG" \
  --dataset-dir "$DATASET" \
  --run-name "$VOICE" \
  --batch-size 1 \
  --max-steps "$STEPS" \
  --max-epochs 1000 \
  --save-every 200 \
  --num-workers 0
echo
echo "checkpoint: $SEED_VC/runs/$VOICE/ft_model.pth"
