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
# Everything the pages play is encoded with ffmpeg (FFMPEG, below): x264 at a
# constant quality with a ceiling on the bitrate, sized to how large each clip
# is actually drawn. That replaced avconvert's presets, which have no rate
# control at all -- resolution was their only lever, and the clips came out at
# 6 to 11 Mbps, a 500px-wide loop as heavy as a full-screen film. Scrolling the
# page once fetched 188MB of video; re-encoded, the same scroll costs about 75MB.
#
# avconvert is kept for the two clips the page no longer plays (JOBS), so they
# can still be rebuilt exactly as they were.
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
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }

# tiny AVFoundation helper: a frame at an exact timestamp, no re-encode
if [ ! -x "$GRAB" ] || [ tools/grabframe.swift -nt "$GRAB" ]; then
  echo "==> building tools/grabframe"
  swiftc -O -o "$GRAB" tools/grabframe.swift 2>/dev/null
fi

# name | master | preset | start | duration ("" = to end) | poster second
JOBS=(
  # Version 1's grading clip, and the beach proposal the page no longer shows.
  "grade-clip|grade fading clip.mp4|Preset1920x1080|0||1"
  "proposal-beach|Proposal video beach NOSOUND.mp4|Preset1280x720|0||38"
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

# Sized to how each clip is drawn. crf is the quality (lower is better), the
# ceiling caps the busiest shots, and the loops carry no sound at all: every
# one of them is digitally silent (-91 dB peak), so the track was dead weight.
#
#   two-up loops, ~500px wide       720p   crf 24-26, 2.5-4 Mbps, no sound
#   full-width loops                1080p  crf 24-25, 3.5-4 Mbps, no sound
#   films, with controls            crf 24-25, 3-4.5 Mbps, sound at 128k
#
# Two have no master on this disk any more -- "save the date.mov" and the ABBA
# reel -- and SKIP here. Their current files were made the same way from the
# previous web encodes, which were 6 Mbps and up, so there was detail to spare.
#
# name | master | start | duration ("" = to end) | width:height | crf | ceiling | sound (none|aac) | poster second
FFMPEG=(
  # The opening loop: on screen at first paint, so the one clip every visitor
  # downloads. 9.4MB as it was; 3.4MB at the same 1080p.
  "hero-loop|hero clip.mp4|0|8|1920:1080|24|4M|none|2"
  "video-banner|promotion 4.mp4|0||1920:1080|25|3.5M|none|4"
  # The Events loops, two abreast at about 500px each. The resort is 60fps and
  # busy, and at 2.5 Mbps it came out measurably softer than before, so it has
  # a higher ceiling; at 4 Mbps it matches the old encode against the master.
  "event-resort|event 5.mp4|0||1280:720|24|4M|none|5.8"
  "event-market|evet 3.mp4|0||1280:720|26|2.5M|none|1.7"
  "agamim-night|hall night.mp4|0||1280:720|26|2.5M|none|3"
  "agamim-sunset|hall sunset.mp4|0||1280:720|26|2.5M|none|3"
  # The promo loop runs the full column on its own, and is 60fps too.
  "promo-film|event longer 1.mp4|0||1280:720|24|4M|none|4.3"
  # Films, with controls and a score. Beit Halochem closes on the client's
  # logo and the desert film's poster is its closing silhouette -- nothing on
  # this site puts type on a photograph.
  "beit-halochem|בית הלוחם סרטון רחפן.mp4|0||1280:720|24|3M|aac|45"
  "desert-proposal-film|Maor & Adi FINAL v4.mp4|0||1920:1080|24|4.5M|aac|45"
  "proposal-film|save the date.mov|0||1280:720|24|3M|aac|3"
  # Vertical. The ABBA poster is the rooftop at dusk; Beyond's promo is the
  # crane on the roof, and its reel the crew lifting the logo.
  "abba-hotel-reel|ABBA Hotel reel.mp4|0||1080:1920|24|3.5M|aac|44"
  "beyond-promo|Meitar Drone.mp4|0||1920:1080|25|4M|aac|2"
  "beyond-reel|Meiar Reel.mp4|0||1080:1920|25|4M|aac|12.5"
)

for job in "${FFMPEG[@]}"; do
  IFS='|' read -r name master start dur size crf ceiling sound pt <<<"$job"
  [ -f "$SRC/$master" ] || { echo "SKIP $name - no master at $SRC/$master"; continue; }

  trim=(-ss "$start"); [ -n "$dur" ] && trim+=(-t "$dur")
  if [ "$sound" = none ]; then audio=(-an); else audio=(-map 0:a:0 -c:a aac -b:a 128k); fi
  bufsize=$(awk "BEGIN { print ${ceiling%M} * 2 }")M

  echo "==> $name  <- $master"
  ffmpeg -nostdin -v error -y "${trim[@]}" -i "$SRC/$master" -map 0:v:0 "${audio[@]}" \
    -vf "scale=$size:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf "$crf" -maxrate "$ceiling" -bufsize "$bufsize" \
    -profile:v high -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    -movflags +faststart -map_metadata -1 "$OUT/$name.mp4"
  printf '    %s\n' "$(ls -lh "$OUT/$name.mp4" | awk '{print $5}')"

  ffmpeg -nostdin -v error -y -ss "$pt" -i "$OUT/$name.mp4" -frames:v 1 -q:v 2 "$POSTERS/$name.jpg"
  echo "    poster @${pt}s"
done

echo
echo "Done. Now run: python3 build-images.py && python3 build.py"
echo "(build-images.py turns assets/video/posters/*.jpg into the poster-* ladder)"
