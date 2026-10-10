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
# presets emit H.264 in an MP4 with fast-start on by default. They have no rate
# control, though, so tools/encode.swift covers the jobs that need a bitrate:
# the same system encoder, driven directly. See RATED at the bottom.
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
ENCODE=tools/.encode

mkdir -p "$POSTERS"
command -v avconvert >/dev/null || { echo "avconvert not found (macOS only)"; exit 1; }

# tiny AVFoundation helper: a frame at an exact timestamp, no re-encode
if [ ! -x "$GRAB" ] || [ tools/grabframe.swift -nt "$GRAB" ]; then
  echo "==> building tools/grabframe"
  swiftc -O -o "$GRAB" tools/grabframe.swift 2>/dev/null
fi

# and its sibling: H.264 at a chosen bitrate, for the jobs at the bottom
if [ ! -x "$ENCODE" ] || [ tools/encode.swift -nt "$ENCODE" ]; then
  echo "==> building tools/encode"
  swiftc -O -o "$ENCODE" tools/encode.swift 2>/dev/null
fi

# name | master | preset | start | duration ("" = to end) | poster second
JOBS=(
  "hero-loop|hero clip.mp4|Preset1920x1080|0|8|2"
  "proposal-film|save the date.mov|Preset1280x720|0||3"
  "grade-clip|grade fading clip.mp4|Preset1920x1080|0||1"
  "event-resort|event 5.mp4|Preset1280x720|0||5.8"
  "event-market|evet 3.mp4|Preset1920x1080|0||1.7"
  "promo-film|event longer 1.mp4|Preset1280x720|0||4.3"
  # The two Agamim Hall aerials the Events section loops. 720p rather than
  # 1080p on purpose: they render about 500px wide in a two-up row and both
  # autoplay at once, so the lighter ladder is the one worth serving.
  "agamim-night|hall night.mp4|Preset1280x720|0||3"
  "agamim-sunset|hall sunset.mp4|Preset1280x720|0||3"
  # The Videography banner. 1080p, unlike the two-up reels: this one runs the
  # full width of the page, so it is the one clip that is actually seen at size.
  "video-banner|promotion 4.mp4|Preset1920x1080|0||4"
  # Two finished films rather than loops cut for texture: the beach proposal
  # opens on a title card and the Beit Halochem piece closes on the client's
  # logo, so neither is trimmed. 720p because avconvert has no rate control --
  # its presets are fixed quality, so resolution is the only lever here, and
  # these still land near 6.6 Mbps. With ffmpeg available, -crf 26 would halve
  # them again at the same size on screen.
  "proposal-beach|Proposal video beach NOSOUND.mp4|Preset1280x720|0||38"
  "beit-halochem|Beit Halohem Drone video.mp4|Preset1280x720|0||45"
  # The desert proposal film. 1080p rather than the 720p the looping reels get:
  # this one is played on purpose, with controls, so it is watched at size and
  # only fetched when someone presses play. Poster taken from the closing
  # silhouette rather than the opening title card -- nothing on this site puts
  # type on a photograph.
  "desert-proposal-film|Maor & Adi FINAL v4.mp4|Preset1920x1080|0||45"
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

# Encoded at a bitrate rather than through a preset, because a preset could not
# get these to a sensible size at full resolution.
#
# name | master | width x height | video kbps | poster second
RATED=(
  # The ABBA Hotel reel: vertical, 4K HEVC, 56 seconds, with a soundtrack.
  # Preset1920x1080 handles the portrait frame correctly but lands at 9.9 Mbps,
  # about 69MB; at 5 Mbps it is 35MB and, compared crop for crop at full size,
  # hard to tell from the master. Poster from the rooftop at dusk -- the reel
  # opens and closes on title cards, and nothing here puts type on a picture.
  "abba-hotel-reel|ABBA Hotel reel.mp4|1080x1920|5000|44"
)

for job in "${RATED[@]}"; do
  IFS='|' read -r name master size kbps pt <<<"$job"
  [ -f "$SRC/$master" ] || { echo "SKIP $name - no master at $SRC/$master"; continue; }

  echo "==> $name  <- $master"
  "$ENCODE" "$SRC/$master" "$OUT/$name.mp4" "${size%x*}" "${size#*x}" "$kbps" | sed 's|^|    |'

  rm -f "$POSTERS/$name.jpg"
  "$GRAB" "$OUT/$name.mp4" "$pt" "$POSTERS/$name.jpg" | sed "s|^|    poster @${pt}s  |"
done

echo
echo "Done. Now run: python3 build-images.py && python3 build.py"
echo "(build-images.py turns assets/video/posters/*.jpg into the poster-* ladder)"
