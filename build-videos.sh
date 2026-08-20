#!/usr/bin/env bash
#
# Builds the web-ready videos the site serves, from the camera masters.
#
#   assets/video/source/*.mp4|.mov          masters (never served, gitignored)
#         |
#         v
#   assets/video/*.mp4                      what the pages play
#   assets/video/posters/*.jpg              a still for each of them
#
# Every master is 4K or 1080p with its moov atom at the end. That is unservable
# three times over: HEVC playback in Chrome and Firefox depends on the machine's
# hardware, 4K at ~20 Mbps is far too heavy to autoplay, and a trailing moov
# means the browser must fetch almost the whole file before it can paint.
#
# avconvert ships with macOS, so there is no Homebrew and no ffmpeg here. Its
# presets emit H.264 in an MP4 with fast-start on by default.
#
# Posters are pulled at a chosen second rather than frame zero, because a first
# frame is usually a fade-in and because a poster that repeats a photograph
# already on the page makes the section look duplicated. The timestamps below
# were picked against the photo set: the proposal film opens on its title card,
# and the grading clip is taken while the shot is still ungraded, so neither
# echoes a still that sits nearby.
#
#   ./build-videos.sh
#
set -euo pipefail
cd "$(dirname "$0")"

SRC=assets/video/source
OUT=assets/video
POSTERS=$OUT/posters
GRAB=tools/.grabframe

mkdir -p "$POSTERS"
command -v avconvert >/dev/null || { echo "avconvert not found (macOS only)"; exit 1; }

# tiny AVFoundation helper: a frame at an exact timestamp, no re-encode
if [ ! -x "$GRAB" ] || [ tools/grabframe.swift -nt "$GRAB" ]; then
  echo "==> building tools/grabframe"
  swiftc -O -o "$GRAB" tools/grabframe.swift 2>/dev/null
fi

# name | master | preset | start | duration ("" = to end) | poster second
JOBS=(
  "hero-loop|hero clip.mp4|Preset1920x1080|0|8|2"
  "proposal-film|save the date.mov|Preset1280x720|0||3"
  "grade-clip|grade fading clip.mp4|Preset1920x1080|0||1"
  "event-resort|event 5.mp4|Preset1280x720|0||5.8"
  "event-market|evet 3.mp4|Preset1920x1080|0||1.7"
  "promo-film|event longer 1.mp4|Preset1280x720|0||4.3"
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r name master preset start dur pt <<<"$job"
  [ -f "$SRC/$master" ] || { echo "SKIP $name - no master at $SRC/$master"; continue; }

  args=(--source "$SRC/$master" --output "$OUT/$name.mp4" --preset "$preset" --replace)
  [ -n "$start" ] && args+=(--start "$start")
  [ -n "$dur" ]   && args+=(--duration "$dur")

  echo "==> $name  <- $master"
  avconvert "${args[@]}" >/dev/null 2>&1
  printf '    %s\n' "$(ls -lh "$OUT/$name.mp4" | awk '{print $5}')"

  rm -f "$POSTERS/$name.jpg"
  "$GRAB" "$OUT/$name.mp4" "$pt" "$POSTERS/$name.jpg" | sed "s|^|    poster @${pt}s  |"
done

echo
echo "Done. Now run: python3 build-images.py && python3 build-pages.py"
echo "(build-images.py turns assets/video/posters/*.jpg into the poster-* ladder)"
