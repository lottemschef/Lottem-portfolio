#!/usr/bin/env python3
"""
Rebuilds the responsive image set the site actually serves.

  assets/photos/*.jpg   masters you drop in (never served)
        |
        v
  assets/img/*-{w}.{webp,jpg}   what index.html points at

Run this after adding or replacing anything in assets/photos/, then update the
matching <picture> block in index.html if you added a new slot.

    python3 build-images.py

Needs Pillow:  python3 -m pip install pillow
"""
import os, re, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'assets', 'photos')
POSTERS = os.path.join(ROOT, 'assets', 'video', 'posters')
OUT = os.path.join(ROOT, 'assets', 'img')
LADDER = [320, 640, 960, 1280, 1920, 2560]

# how wide each kind of frame renders, so the browser picks the right file
SIZES_FOR = {
    'hero-wide': '100vw', 'video-hero': '100vw',
    'profile-portrait': '(min-width: 52rem) 30vw, 94vw',
    'footer-portrait': '(min-width: 52rem) 40vw, 94vw',
    'proposals-featured': '(min-width: 46rem) 46vw, 94vw',
    'productions-featured': '(min-width: 46rem) 46vw, 94vw',
    'launches-featured': '(min-width: 46rem) 46vw, 94vw',
    'aerial-featured': '(min-width: 46rem) 46vw, 94vw',
    'concerts-featured': '(min-width: 46rem) 46vw, 94vw',
    'artists-tile': '(min-width: 40rem) 30vw, 47vw',
    'video-tile': '(min-width: 46rem) 32vw, 49vw',
}

def widths_for(w):
    return [x for x in LADDER if x < w] + [w]

def build(path, name):
    im = Image.open(path)
    ow, oh = im.size
    made = []
    for w in widths_for(ow):
        h = round(oh * w / ow)
        resized = im.resize((w, h), Image.LANCZOS).convert('RGB')
        resized.save(f'{OUT}/{name}-{w}.webp', 'WEBP', quality=78, method=6)
        resized.save(f'{OUT}/{name}-{w}.jpg', 'JPEG', quality=82,
                     optimize=True, progressive=True)
        made.append(w)
    return {'widths': made, 'w': ow, 'h': oh}

def rewrite_markup(manifest):
    """Point every <picture> in index.html at the ladder that now exists.

    The widths change whenever a master is replaced at a different size, so
    keeping the srcset in sync by hand is a standing invitation to a broken
    image. This regenerates it from what is actually on disk."""
    page = os.path.join(ROOT, 'index.html')
    html = open(page, encoding='utf-8').read()
    changed = 0

    def block(m):
        nonlocal changed
        indent, body = m.group(1), m.group(0)
        stem = re.search(r'assets/img/([a-z0-9-]+?)-\d+\.(?:jpg|webp)', body)
        if not stem:
            return body
        name = stem.group(1)
        if name not in manifest:
            return body
        widths = manifest[name]['widths']
        w, h = manifest[name]['w'], manifest[name]['h']
        sizes = re.search(r'sizes="([^"]+)"', body)
        sizes = sizes.group(1) if sizes else '100vw'
        alt = re.search(r'alt="([^"]*)"', body)
        alt = alt.group(1) if alt else ''
        # a class on the image carries its positioning — losing it once put a
        # full-height poster over the play button and made the reels unclickable
        klass = re.search(r'<img[^>]*\bclass="([^"]*)"', body)
        klass = f'class="{klass.group(1)}" ' if klass else ''
        extra = ' '.join(a for a in ('fetchpriority="high"',) if a in body)
        loading = 'loading="lazy" ' if 'loading="lazy"' in body else ''

        # the art-directed mobile sources are kept as they are
        art = ''.join(re.findall(r'^\s*<source media=[^\n]*\n', body, re.M))

        ss = lambda e: ', '.join(f'assets/img/{name}-{x}.{e} {x}w' for x in widths)
        changed += 1
        return (f'{indent}<picture>\n{art}'
                f'{indent}  <source type="image/webp" srcset="{ss("webp")}" sizes="{sizes}">\n'
                f'{indent}  <img {klass}src="assets/img/{name}-{widths[-1]}.jpg" srcset="{ss("jpg")}" '
                f'sizes="{sizes}" alt="{alt}" width="{w}" height="{h}" '
                f'{loading}{extra} decoding="async">\n'
                f'{indent}</picture>')

    html = re.sub(r'( *)<picture>.*?</picture>', block, html, flags=re.S)

    # A marked placeholder becomes a real frame as soon as its master appears,
    # so dropping a file into assets/photos is all it takes to fill a slot.
    def fill(m):
        nonlocal changed
        indent, cls, attrs, name = m.group(1), m.group(2), m.group(3), m.group(4)
        if name not in manifest:
            return m.group(0)
        widths = manifest[name]['widths']
        w, h = manifest[name]['w'], manifest[name]['h']
        sizes = SIZES_FOR.get(name.rsplit('-', 1)[0], '(min-width: 46rem) 34vw, 50vw')
        alt = name.rsplit('-', 1)[0].replace('-', ' ').capitalize()
        ss = lambda e: ', '.join(f'assets/img/{name}-{x}.{e} {x}w' for x in widths)
        changed += 1
        return (f'{indent}<div class="slot{cls}"{attrs}>\n'
                f'{indent}  <picture>\n'
                f'{indent}    <source type="image/webp" srcset="{ss("webp")}" sizes="{sizes}">\n'
                f'{indent}    <img src="assets/img/{name}-{widths[-1]}.jpg" srcset="{ss("jpg")}" '
                f'sizes="{sizes}" alt="{alt}" width="{w}" height="{h}" loading="lazy" decoding="async">\n'
                f'{indent}  </picture>\n'
                f'{indent}</div>')

    html = re.sub(r'( *)<div class="slot([^"]*)"([^>]*)>\s*'
                  r'<span class="slot__tag"><b>([a-z0-9-]+)</b>[^<]*</span>\s*</div>',
                  fill, html)

    open(page, 'w', encoding='utf-8').write(html)
    return changed


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for f in sorted(os.listdir(SRC)):
        if f.lower().endswith(('.jpg', '.jpeg', '.png')):
            name = os.path.splitext(f)[0]
            manifest[name] = build(os.path.join(SRC, f), name)
            print(f'  {name:28} {manifest[name]["w"]}px -> {len(manifest[name]["widths"])} sizes')
    if os.path.isdir(POSTERS):
        for f in sorted(os.listdir(POSTERS)):
            if f.lower().endswith('.jpg'):
                name = 'poster-' + os.path.splitext(f)[0]
                manifest[name] = build(os.path.join(POSTERS, f), name)
                print(f'  {name:28} {manifest[name]["w"]}px -> {len(manifest[name]["widths"])} sizes')

    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    n = rewrite_markup(manifest)
    print(f'\n{n} <picture> blocks repointed at the new ladder')
    print('now run: python3 build-pages.py')
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'\n{len(manifest)} images -> {len(os.listdir(OUT))} files, {total/1024/1024:.1f} MB')
    print('(a visitor downloads one size per image, not the whole set)')

if __name__ == '__main__':
    if not os.path.isdir(SRC):
        sys.exit(f'no masters found at {SRC}')
    main()
