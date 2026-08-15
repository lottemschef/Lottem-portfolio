#!/usr/bin/env python3
"""
Generates the two language pages from one source.

    index.html      the template, and the English page
    he/index.html   generated

    python3 build-pages.py

Run after editing content/strings.json or the markup in index.html.

Why two files rather than swapping text in the browser: a crawler asking for
the Hebrew page has to receive Hebrew HTML. Swapping at runtime meant both
URLs returned English, so the Hebrew half of the site was invisible to search.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

STRINGS = json.load(open('content/strings.json', encoding='utf-8'))
SRC = open('index.html', encoding='utf-8').read()


def put_text(html, strings):
    """fill every data-i18n element with the string for this language"""
    def sub(m):
        open_tag, key = m.group(1), m.group(2)
        val = strings.get(key)
        return open_tag + (val if val is not None else m.group(3)) + m.group(4)
    return re.sub(r'(<[^>]*data-i18n="([^"]+)"[^>]*>)([^<]*)(<)', sub, html)


def put_attrs(html, strings):
    """data-i18n-attr="aria-label:a11y.menu" -> the attribute itself"""
    def sub(m):
        tag = m.group(0)
        for pair in m.group(1).split('|'):
            attr, key = pair.split(':')
            val = strings.get(key)
            if val is None:
                continue
            if re.search(rf'{attr}="[^"]*"', tag):
                tag = re.sub(rf'{attr}="[^"]*"', f'{attr}="{val}"', tag, count=1)
            else:
                tag = tag[:-1] + f' {attr}="{val}">'
        return tag
    return re.sub(r'<[^>]*data-i18n-attr="([^"]+)"[^>]*>', sub, html)


def relativise(html):
    """the Hebrew page sits one level down, so local paths need a step up"""
    html = re.sub(r'((?:src|href)=")(assets/|css/|js/)', r'\1../\2', html)
    html = re.sub(r'(srcset=")([^"]+)"',
                  lambda m: m.group(1) + re.sub(r'(^|,\s*)(assets/)', r'\1../\2', m.group(2)) + '"',
                  html)
    return html


def language_switch(html, lang):
    """the control becomes a real link — it works with the script off"""
    other, label_he, label_en = ('en', 'עב', 'EN')
    if lang == 'en':
        markup = ('<a class="lang__btn" href="he/" hreflang="he" lang="he" '
                  'data-lang-link>עב</a>\n          '
                  '<span class="lang__btn is-current" aria-current="true">EN</span>')
    else:
        markup = ('<span class="lang__btn is-current" aria-current="true">עב</span>\n          '
                  '<a class="lang__btn" href="../" hreflang="en" lang="en" '
                  'data-lang-link>EN</a>')
    return re.sub(r'<div class="lang">.*?</div>',
                  f'<div class="lang">\n          {markup}\n        </div>',
                  html, flags=re.S)


def head(html, lang, strings):
    dir_ = 'rtl' if lang == 'he' else 'ltr'
    html = re.sub(r'<html[^>]*>', f'<html lang="{lang}" dir="{dir_}">', html, count=1)
    html = re.sub(r'<title>.*?</title>', f'<title>{strings["meta.title"]}</title>', html, flags=re.S)
    html = re.sub(r'(<meta name="description" content=")[^"]*(")',
                  rf'\g<1>{strings["meta.desc"]}\g<2>', html)
    html = re.sub(r'(<meta property="og:title" content=")[^"]*(")',
                  rf'\g<1>{strings["meta.title"].replace("&", "&amp;")}\g<2>', html)
    html = re.sub(r'(<meta property="og:description" content=")[^"]*(")',
                  rf'\g<1>{strings["meta.desc"]}\g<2>', html)
    html = re.sub(r'(<meta property="og:locale" content=")[^"]*(")',
                  rf'\g<1>{"he_IL" if lang == "he" else "en_GB"}\g<2>', html)
    html = re.sub(r'(<meta property="og:locale:alternate" content=")[^"]*(")',
                  rf'\g<1>{"en_GB" if lang == "he" else "he_IL"}\g<2>', html)

    prefix = '../' if lang == 'he' else ''
    alts = (f'  <link rel="alternate" hreflang="en" href="{prefix}">\n'
            f'  <link rel="alternate" hreflang="he" href="{prefix}he/">\n'
            f'  <link rel="alternate" hreflang="x-default" href="{prefix}">')
    html = re.sub(r'  <link rel="alternate"[^>]*>\n'
                  r'  <link rel="alternate"[^>]*>\n'
                  r'  <link rel="alternate"[^>]*>', alts, html)
    return html


def build(lang):
    s = STRINGS[lang]
    html = put_text(SRC, s)
    html = put_attrs(html, s)
    html = head(html, lang, s)
    html = language_switch(html, lang)
    if lang == 'he':
        html = relativise(html)
        os.makedirs('he', exist_ok=True)
        open('he/index.html', 'w', encoding='utf-8').write(html)
        return 'he/index.html'
    open('index.html', 'w', encoding='utf-8').write(html)
    return 'index.html'


def build_404():
    """One page, served for every missing path. GitHub Pages only reads the
       root 404.html, so it carries the default language and links to both."""
    s = STRINGS['en']
    html = open('404.src.html', encoding='utf-8').read()
    html = put_text(html, s)
    html = put_attrs(html, s)
    html = re.sub(r'<title>.*?</title>', f'<title>{s["nf.title"]} · Lottem Schefenbauer</title>',
                  html, flags=re.S)
    open('404.html', 'w', encoding='utf-8').write(html)
    return '404.html'


if __name__ == '__main__':
    for lang in ('en', 'he'):
        path = build(lang)
        n = len(open(path, encoding='utf-8').read())
        print(f'  {path:16} {n // 1024} KB  ({len(STRINGS[lang])} strings)')
    if os.path.exists('404.src.html'):
        print(f'  {build_404():16} generated')
    print('\nBoth pages regenerated from content/strings.json.')
