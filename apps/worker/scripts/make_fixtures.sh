#!/usr/bin/env bash
# Build a rights-free smoke-test pair:
#   samples/synthetic_song.wav — 90 s: spoken "vocal" (macOS `say`) over a synthetic chord bed
#   voices/demo_voice.wav      — 15 s reference voice from a different macOS voice
# Real quality evaluation still needs real songs you have rights to (PRD §4).
set -euo pipefail
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$WORKER_DIR/samples" "$WORKER_DIR/voices" "$WORKER_DIR/work"
TMP="$WORKER_DIR/work/fixtures"; mkdir -p "$TMP"

if ! command -v say >/dev/null; then
  echo "macOS 'say' not available: put your own song in samples/ and a 10-25 s clean vocal in voices/." >&2
  exit 1
fi

LYRIC="Twinkle twinkle little star, how I wonder what you are. Up above the world so high, like a diamond in the sky."
say -v Samantha -r 150 -o "$TMP/vocal.aiff" "$LYRIC $LYRIC $LYRIC $LYRIC"
say -v Daniel -r 160 -o "$TMP/ref.aiff" "The quick brown fox jumps over the lazy dog. She sells sea shells by the sea shore. Peter Piper picked a peck of pickled peppers."

# chord bed: three sines, 90 s, quiet
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=220:duration=90" -f lavfi -i "sine=frequency=277:duration=90" -f lavfi -i "sine=frequency=330:duration=90" \
  -filter_complex "[0:a][1:a][2:a]amix=inputs=3:normalize=0,volume=0.15,aformat=channel_layouts=stereo[bed]" -map "[bed]" -ar 44100 "$TMP/bed.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/vocal.aiff" -af "adelay=5000|5000,apad=whole_dur=90,aformat=channel_layouts=stereo" -ar 44100 "$TMP/vocal.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/vocal.wav" -i "$TMP/bed.wav" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:normalize=0" -ar 44100 -ac 2 "$WORKER_DIR/samples/synthetic_song.wav"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/ref.aiff" -t 15 -ar 44100 -ac 1 "$WORKER_DIR/voices/demo_voice.wav"
echo "wrote samples/synthetic_song.wav and voices/demo_voice.wav"
