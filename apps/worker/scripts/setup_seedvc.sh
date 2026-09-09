#!/usr/bin/env bash
# Clone Seed-VC into apps/worker/vendor/seed-vc and give it its own Python 3.11 venv.
# Idempotent: re-running updates nothing destructive.
set -euo pipefail
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$WORKER_DIR/vendor/seed-vc"
REPO_URL="${SEED_VC_REPO:-https://github.com/Plachtaa/seed-vc.git}"
PYTHON_VERSION="${SEED_VC_PYTHON_VERSION:-3.11}"

if [ ! -d "$VENDOR_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$VENDOR_DIR"
fi
cd "$VENDOR_DIR"
if [ ! -x .venv/bin/python ]; then
  uv venv --python "$PYTHON_VERSION" .venv
fi
uv pip install --python .venv/bin/python -r "$WORKER_DIR/scripts/seedvc-requirements.txt"
echo
echo "Seed-VC ready: $VENDOR_DIR (python: $VENDOR_DIR/.venv/bin/python)"
echo "Model checkpoints (~3 GB) download automatically on first run into $VENDOR_DIR/checkpoints"
