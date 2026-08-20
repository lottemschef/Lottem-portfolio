# Version 2

A one-page site with a side navigation that arrives on scroll. Same content and
the same copper-on-black identity as version 1, rebuilt around a declared
spacing scale and a picture grid that never crops.

Version 1 is untouched and still lives at the repository root. Nothing here
overwrites it, and the two share one `assets/` directory rather than
duplicating 1.1 GB of photographs and film.

## Running it

```bash
python3 -m http.server 5175
```

Then open `http://localhost:5175/v2/` — Hebrew is at `/v2/he/`.

## Editing

```
template.html          the markup — the only file you edit
content/strings.json   every string, both languages
css/                   base (tokens) · layout (grid) · components
js/                    ui.js · lang.js
index.html             generated — do not edit
he/index.html          generated — do not edit
```

After changing either the template or the strings:

```bash
python3 v2/build.py
```

The build fills both languages from one template, expands each `x-photo` tag
into a full responsive `<picture>` using `assets/img/manifest.json`, and stamps
every stylesheet and script with a hash of its own contents so a deploy is not
invisible behind a stale cache. It refuses to write a page if the two
dictionaries have drifted apart or the template asks for a string that does not
exist — the two ways a bilingual page silently loses a line.

## The four things this version was built to fix

**The navigation is not on the first screen.** The rail is `visibility:
hidden` until you scroll, so it is out of the tab order and out of the
accessibility tree as well as out of sight — not merely transparent. It appears
at a fifth of the first screen and hides again at a lower mark, so a scroll that
stops on the boundary cannot flicker it. Below 60rem it becomes a menu button
that follows exactly the same rule. The language switch is the exception that
proves it: the hero carries its own copy, so language is reachable at the top
even though navigation is not.

**The margins are generous, and the rail can never reach the text.** That is
arithmetic, not judgement: `--pad-x` is written as the rail's own footprint
plus a gutter (`css/base.css`, the 60rem and 82rem queries). Widen the rail and
the margin widens with it. Measured, the clearance is 21.6px with the rail
collapsed and 32–46px with its labels showing, at every width from 960px up.

**Photographs are shown whole, and the wall has no holes.** The galleries are
justified rows, not columns: each row takes as many frames as sit comfortably
at a target height, then every frame in it is scaled to the one height that
makes the row fill the width exactly. Ratios survive to the last decimal
because the height is derived from them rather than imposed on them, so every
row is flush left and right and nothing is cropped. Measured across all six
breakpoints, the largest difference between a picture's rendered ratio and its
intrinsic ratio is 0.3%, which is rounding.

Columns were tried first and cannot do this. Fill eight frames of two shapes
into three columns and one column ends short: CSS multi-column left 181px of
dead space under the middle one, and `grid-auto-flow: dense` left 212px, since
dense back-fills a hole that has something after it and the short column is
simply where the pictures ran out. An exhaustive search over every possible
assignment of those eight frames puts the best any column packing could manage
at 213px. The raggedness is the layout model, not the algorithm.

Where the rows break is chosen for the wall as a whole rather than one row at a
time (`planRows` in `js/ui.js`) — a left-to-right greedy pass spends the good
frames early and leaves a last row half again as tall as the rest. Row length
carries a small cost too, so the declared `--cols` and the media queries behind
it stay in charge and the fit only breaks the tie; without it the arithmetic
bought a very even wall by going four across at 142px tall.

**Buttons breathe.** One spacing scale is declared in `css/base.css` and
everything reads from it. `.actions` is the only correct wrapper for a button
and opens with `--sp-7` — four rem — of space; the button carries `--sp-5`
across and `--sp-3` down inside a 3.25rem floor. A safety net rule catches a
button dropped straight after a paragraph without its wrapper. Measured, the
gap above the contact buttons is 96px.

## Promoting it to the site root

`ASSET_ROOT` at the top of `build.py` is how `v2/index.html` reaches the shared
`assets/`. It is `'../'` while this folder sits inside the version 1
repository. Move the folder's contents to the root, set it to `'./'`, rebuild,
and every path is correct again. That constant is the whole of the change.

## No typography on the photographs

Location and year lists, reel labels, film captions and the viewer's caption
are all gone: a picture on this site carries no text on it, beside it or under
it. The section headings and the paragraph that introduces each body of work
stay, because those are the page's writing rather than a label on a frame.

The one thing kept in the markup is the pair of before / after labels on the
grading wipe. They are clipped out of sight, not deleted, because a screen
reader cannot infer "this half is ungraded" from a seam and a drag handle. To
put them back on screen, delete the `.compare__badge` rule in
`css/components.css`.

## The two galleries

They are laid out differently on purpose, because they hold different pictures.

**Artist portraits** is a fixed contact sheet: `grid-template-columns:
repeat(3, 1fr)`, which with six frames is three across and two down. The
picture is capped by *height* (`--tile-h`) and centred in its cell rather than
being stretched to fill it, so it comes down from 322x483 to 171x256 with
nothing cropped: the cell stays a third of the row and the portrait simply sits
smaller inside it. The gallery is 544px tall where it was 1007px. Change
`--tile-h` in `css/layout.css` to make the sheet larger or smaller; the grid
does not move.

**Marriage proposals** keeps the justified-row engine, with the row rhythm
stated in the markup as `data-rows="3 2 3"` — three frames, then the pair
large, then three. `statedRows` in `js/ui.js` reads it, and the same code still
justifies each row to the full width, so a hand-written plan can change the
rhythm but cannot open a gap or crop anything. It applies at the widest layout
only; below that there are fewer columns and the automatic planner takes over —
two across down to the smallest phone, because every frame in this wall is
landscape and two of them still read at 156px wide where one portrait would
not. Row widths are written in CSS terms rather than pixels, so a row stays
justified continuously through a resize and the script only has to decide how
many frames share a line.

A dense span grid was the obvious thing to reach for here and it does not work
on this set. All eight proposal frames are landscape, in two ratios — three at
16:9 and five at 3:2 — so there is no portrait for a taller span to key off,
and integer column spans cannot express both ratios at once: a 16:9 and a 3:2
sharing a row need widths of 54.2% and 45.8%, which is 6.5 columns of twelve.
Round it to 7 and 5 and the two heights differ by 18%, which has to come out of
the pictures as a crop. The justified row gets the same arrangement exactly
right because it solves for the height instead of rounding to a track.

## Films in the Events section

The four films there are reels: `autoplay loop muted playsinline`, no controls
and no play button, so each one behaves like a photograph that happens to move.
`muted` and `playsinline` are the two attributes the autoplay policy actually
checks, and they are in the markup rather than set by script, so the reels play
with JavaScript switched off.

What `js/ui.js` adds is restraint. Together the four are about 47MB, which is
far too much to fetch on first paint, so each carries `preload="none"` and
`initReels` starts one when it scrolls into view and pauses it when it leaves.
A visitor downloads the films they actually look at.

The pause is per reel, not one-at-a-time as the old player governor was. These
sit two abreast, and with a single winner one half of a pair would run while
the other stood frozen beside it, which reads as a broken video rather than as
a layout. Reduced motion and Data Saver park every reel on its poster frame.

`event-resort.mp4` is 19MB for 14 seconds, around 10 Mbps, which is generous
for a clip that renders 500px wide. Re-encoding the Events reels at a lower
bitrate would cut that section's weight by more than half without a visible
difference at this size. Nothing depends on it, so it is left as it is.

## Why the grading clip went

The colour-grading section used to close on an aerial of Agamim Hall at dusk.
The Events section now loops that same venue at the same hour, from a near
identical altitude — two takes minutes apart, not two pieces of work. The film
is gone from both language pages and the before/after wipe runs full width in
its place.

`assets/video/grade-clip.mp4` is still on disk because version 1 still plays
it. Delete the file only if version 1 goes.
