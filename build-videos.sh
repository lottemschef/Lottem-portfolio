#!/usr/bin/env bash
#
# Builds the web-ready videos the site serves, from the camera masters.
#
#   assets/video/source/*.mp4|.mov          masters (never served, gitignored)
#         |
#         v
#   assets/video/hero-loop.mp4              silent background loop
#   assets/video/grade-clip.mp4             colour-grading showcase
#   assets/video/proposal-save-the-date.mp4 full-length proposal film
#   assets/video/posters/*.jpg              a still for each of them
#
# Every master is 4K HEVC with its moov atom at the end of the file. That is
# unservable three times over: HEVC playback in Chrome and Firefox depends on
# the machine's hardware, 4K at ~20 Mbps is far too heavy to autoplay, and a
# trailing moov means the browser must fetch almost the whole file before it
# can paint a frame.
#
# This uses avconvert, which ships with macOS — no Homebrew, no ffmpeg. Its
# presets emit H.264 (avc1) in an MP4 with fast-start on by default, which is
# exactly the three things that were wrong. Re-run it after replacing a master.
#
#   ./build-videos.sh
#
set -euo pipefail
cd "$(dirname "$0")"

SRC=assets/video/source
OUT=assets/video
POSTERS=$OUT/posters
mkdir -p "$POSTERS"

command -v avconvert >/dev/null || { echo "avconvert not found (macOS only)"; exit 1; }

# name | master | preset | start | duration ("" = to end)
# The hero is trimmed: it loops forever, so only the strongest few seconds earn
# their bytes on first paint.
JOBS=(
  "hero-loop|hero clip cropped.mp4|Preset1920x1080|0|8"
  "grade-clip|grade fading clip.mp4|Preset1920x1080|0|"
  "proposal-save-the-date|save the date.mov|Preset1280x720|0|"   # 45s: 1080p put it over GitHub's 50MB advisory
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r name master preset start dur <<<"$job"
  [ -f "$SRC/$master" ] || { echo "SKIP $name — no master at $SRC/$master"; continue; }

  args=(--source "$SRC/$master" --output "$OUT/$name.mp4" --preset "$preset" --replace)
  [ -n "$start" ] && args+=(--start "$start")
  [ -n "$dur" ]   && args+=(--duration "$dur")

  echo "==> $name  <- $master"
  avconvert "${args[@]}" >/dev/null 2>&1
  printf '    %s\n' "$(ls -lh "$OUT/$name.mp4" | awk '{print $5}')"

  # Poster: QuickLook renders a frame without needing a video decoder on the
  # command line. The <video> shows it while the file buffers.
  rm -f "$POSTERS/$name.png" "$POSTERS/$name.jpg"
  qlmanage -t -s 1600 -o "$POSTERS" "$OUT/$name.mp4" >/dev/null 2>&1 || true
  if [ -f "$POSTERS/$name.mp4.png" ]; then
    sips -s format jpeg -s formatOptions 82 "$POSTERS/$name.mp4.png" \
         --out "$POSTERS/$name.jpg" >/dev/null 2>&1 || true
    rm -f "$POSTERS/$name.mp4.png"
    echo "    poster -> $POSTERS/$name.jpg"
  fi
done

echo
echo "Done. Now run: python3 build-images.py && python3 build-pages.py"
echo "(build-images.py turns assets/video/posters/*.jpg into the poster-* ladder)"
