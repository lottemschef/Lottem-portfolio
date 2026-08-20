#!/usr/bin/env python3
"""
Version 2 build. One template in, two language pages out.

    template.html          the only file you edit
    content/strings.json   every string, both languages
    index.html             generated — English
    he/index.html          generated — Hebrew, RTL

    python3 v2/build.py

Three things separate this from the version 1 build:

1. The template is not also an output. In v1 index.html was both, so every
   build read back its own generated markup and each pass had to be written to
   survive being fed its own output. Here template.html is only ever read.

2. Photographs are written once, as <x-photo name="proposals-tile-01">, and
   expanded here from assets/img/manifest.json — full srcset, both formats,
   and the intrinsic width/height that stops the page reflowing as images
   land. Hand-typing nine widths per picture is how the wrong ratio gets in.

3. Assets are shared with version 1 rather than copied. They are 1.1 GB.
   ASSET_ROOT says how to reach them; flipping it is the whole of promoting
   this folder to the site root.
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

# How to reach the shared assets/ directory from v2/index.html. '../' while v2
# lives inside the v1 repository; './' once this folder becomes the site root.
ASSET_ROOT = '../'

STRINGS = json.load(open('content/strings.json', encoding='utf-8'))
MANIFEST = json.load(open(f'{ASSET_ROOT}assets/img/manifest.json', encoding='utf-8'))
TEMPLATE = open('template.html', encoding='utf-8').read()

SITE = 'https://lottemschef.github.io/Lottem-portfolio/'


# ---------------------------------------------------------------- photographs

def photo(m):
    """<x-photo name=… altkey=… sizes=… [class=…] [eager]> -> <picture>

    The browser is handed every rendered width in both formats and picks one.
    Nothing here sets a crop or an aspect ratio: the intrinsic dimensions go on
    the <img> and the stylesheet lets the picture keep its own proportions.

    altkey names a string rather than carrying the text, so alt text is
    translated along with everything else. Version 1 hard-coded it in the
    markup, which is how the Hebrew page came to describe its photographs in
    English — to a screen reader, the one part of that page still in the wrong
    language. The tag emits an empty alt plus a data-i18n-attr, and put_attrs
    fills it in the pass below.
    """
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    name = attrs.get('name', '')
    entry = MANIFEST.get(name)
    if not entry:
        sys.exit(f'  build error: no image named "{name}" in the manifest')

    widths = entry['widths']
    sizes = attrs.get('sizes', '100vw')
    eager = 'eager' in m.group(1)

    # Bare paths, exactly as the template writes them by hand. set_paths() is
    # the single place that knows how deep the page being written sits; an
    # expander that prefixed its own output put the Hebrew page's photographs
    # one directory too high while its videos, written literally, were right.
    def srcset(ext):
        return ', '.join(f'assets/img/{name}-{w}.{ext} {w}w' for w in widths)

    largest = widths[-1]
    cls = attrs.get('class', '')
    cls_attr = f' class="{cls}"' if cls else ''
    loading = 'eager' if eager else 'lazy'
    priority = ' fetchpriority="high"' if eager else ''

    altkey = attrs.get('altkey')
    alt = f' alt="" data-i18n-attr="alt:{altkey}"' if altkey else ' alt=""'

    return (
        f'<picture>'
        f'<source type="image/webp" srcset="{srcset("webp")}" sizes="{sizes}">'
        f'<img{cls_attr} src="assets/img/{name}-{largest}.jpg" '
        f'srcset="{srcset("jpg")}" sizes="{sizes}"'
        f'{alt} width="{entry["w"]}" height="{entry["h"]}" '
        f'loading="{loading}" decoding="async"{priority}>'
        f'</picture>'
    )


def expand_photos(html):
    return re.sub(r'<x-photo\s+([^>]*?)\s*/?>', photo, html)


# ------------------------------------------------------------------- language

def put_text(html, strings):
    """fill every data-i18n element with the string for this language"""
    def sub(m):
        open_tag, key = m.group(1), m.group(2)
        val = strings.get(key)
        if val is None:
            sys.exit(f'  build error: missing string "{key}"')
        return open_tag + val + m.group(4)
    return re.sub(r'(<[^>]*data-i18n="([^"]+)"[^>]*>)([^<]*)(<)', sub, html)


def put_attrs(html, strings):
    """data-i18n-attr="aria-label:a11y.menu|title:x" -> the attributes themselves"""
    def sub(m):
        tag = m.group(0)
        for pair in m.group(1).split('|'):
            attr, key = pair.split(':', 1)
            val = strings.get(key)
            if val is None:
                sys.exit(f'  build error: missing string "{key}"')
            val = val.replace('"', '&quot;')
            if re.search(rf'\b{attr}="[^"]*"', tag):
                tag = re.sub(rf'\b{attr}="[^"]*"', f'{attr}="{val}"', tag, count=1)
            else:
                tag = tag[:-1] + f' {attr}="{val}">'
        return tag
    return re.sub(r'<[^>]*data-i18n-attr="([^"]+)"[^>]*>', sub, html)


def language_switch(html, lang):
    """A real link, so the control works with the script switched off."""
    if lang == 'en':
        markup = ('<a class="lang__btn" href="he/" hreflang="he" lang="he" '
                  'data-lang-link>עב</a>'
                  '<span class="lang__btn is-current" aria-current="true">EN</span>')
    else:
        markup = ('<span class="lang__btn is-current" aria-current="true">עב</span>'
                  '<a class="lang__btn" href="../" hreflang="en" lang="en" '
                  'data-lang-link>EN</a>')
    return re.sub(r'(<div class="lang"[^>]*>).*?(</div>)',
                  lambda m: m.group(1) + markup + m.group(2),
                  html, flags=re.S)


# ------------------------------------------------------------------ page paths

def set_paths(html, lang):
    """Rewrite the template's paths for the page being written.

    Two different rules, because css/ and js/ live inside v2 while assets/ is
    shared with version 1 and sits above it:

        index.html      css/…       {ASSET_ROOT}assets/…
        he/index.html   ../css/…    ../{ASSET_ROOT}assets/…
    """
    up = '../' if lang == 'he' else ''
    asset = up + ASSET_ROOT

    html = re.sub(r'(?<=")assets/', asset + 'assets/', html)
    html = re.sub(r'(?<=, )assets/', asset + 'assets/', html)
    if up:
        html = re.sub(r'(?<=")(css|js)/', up + r'\1/', html)
    return html


def head(html, lang, s):
    direction = 'rtl' if lang == 'he' else 'ltr'
    page_url = SITE + ('he/' if lang == 'he' else '')
    other = 'en' if lang == 'he' else 'he'
    up = '../' if lang == 'he' else ''

    repl = {
        r'<html[^>]*>': f'<html lang="{lang}" dir="{direction}">',
        r'<title>.*?</title>': f'<title>{s["meta.title"]}</title>',
        r'(<meta name="description" content=")[^"]*(")': s['meta.desc'],
        r'(<meta property="og:title" content=")[^"]*(")': s['meta.title'].replace('&', '&amp;'),
        r'(<meta property="og:description" content=")[^"]*(")': s['meta.desc'],
        r'(<meta property="og:locale" content=")[^"]*(")': 'he_IL' if lang == 'he' else 'en_GB',
        r'(<meta property="og:locale:alternate" content=")[^"]*(")': 'en_GB' if lang == 'he' else 'he_IL',
        r'(<meta property="og:url" content=")[^"]*(")': page_url,
        r'(<link rel="canonical" href=")[^"]*(")': page_url,
    }
    for pattern, value in repl.items():
        if pattern.startswith('<html') or pattern.startswith('<title'):
            html = re.sub(pattern, value, html, count=1, flags=re.S)
        else:
            html = re.sub(pattern, lambda m, v=value: m.group(1) + v + m.group(2), html, count=1)

    alts = (f'  <link rel="alternate" hreflang="en" href="{up}">\n'
            f'  <link rel="alternate" hreflang="he" href="{up}he/">\n'
            f'  <link rel="alternate" hreflang="x-default" href="{up}">')
    html = re.sub(r'  <link rel="alternate"[^>]*>\n'
                  r'  <link rel="alternate"[^>]*>\n'
                  r'  <link rel="alternate"[^>]*>', alts, html)
    return html


def stamp_assets(html):
    """?v= on every stylesheet and script, taken from the file's own contents.

    Without it a browser keeps serving the copy it cached, so a deploy that
    only touches CSS reaches nobody until they hard-reload — which visitors do
    not do. The tag is a hash, so it moves exactly when the file moves.
    """
    def tag(m):
        attr, path = m.group(1), m.group(2)
        local = re.sub(r'^(\.\./)+', '', path)
        if not os.path.exists(local):
            return m.group(0)
        digest = hashlib.sha256(open(local, 'rb').read()).hexdigest()[:8]
        return f'{attr}"{path}?v={digest}"'

    return re.sub(r'(href=|src=)"((?:\.\./)*(?:css|js)/[^"?]+\.(?:css|js))(?:\?[^"]*)?"',
                  tag, html)


# ------------------------------------------------------------------------ run

def build(lang):
    s = STRINGS[lang]
    html = expand_photos(TEMPLATE)
    html = put_text(html, s)
    html = put_attrs(html, s)
    html = head(html, lang, s)
    html = language_switch(html, lang)
    html = set_paths(html, lang)
    html = stamp_assets(html)

    path = 'he/index.html' if lang == 'he' else 'index.html'
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    open(path, 'w', encoding='utf-8').write(html)
    return path


def check():
    """Both dictionaries must carry the same keys, or one page loses a line."""
    en, he = set(STRINGS['en']), set(STRINGS['he'])
    for missing, where in ((en - he, 'he'), (he - en, 'en')):
        if missing:
            sys.exit(f'  build error: {where} is missing {sorted(missing)}')

    # against the expanded template: the alt keys only exist once <x-photo> has
    # been turned into a <picture>, so checking the raw file would report every
    # one of them as unused and none of them as missing
    expanded = expand_photos(TEMPLATE)
    used = set(re.findall(r'data-i18n="([^"]+)"', expanded))
    for group in re.findall(r'data-i18n-attr="([^"]+)"', expanded):
        used |= {p.split(':', 1)[1] for p in group.split('|')}
    unknown = used - en
    if unknown:
        sys.exit(f'  build error: template asks for unknown strings {sorted(unknown)}')

    unused = en - used - {'meta.title', 'meta.desc'}
    if unused:
        print(f'  note: {len(unused)} strings defined but unused: {sorted(unused)}')


if __name__ == '__main__':
    check()
    for lang in ('en', 'he'):
        path = build(lang)
        size = len(open(path, encoding='utf-8').read()) // 1024
        print(f'  v2/{path:16} {size:>3} KB   ({len(STRINGS[lang])} strings)')
    print('\nBoth pages regenerated from template.html + content/strings.json.')
