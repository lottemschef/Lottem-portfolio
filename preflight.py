#!/usr/bin/env python3
"""
Pre-flight checks. Run before every deploy.

    python3 preflight.py

Each check exists because something actually went wrong once. The overlay
check in particular: a hidden full-screen menu kept its layout box and
silently swallowed every click on the page.
"""
import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
fails, warns = [], []

def fail(m): fails.append(m)
def warn(m): warns.append(m)

html = open('index.html', encoding='utf-8').read()
css_raw = ''.join(open(f'css/{f}', encoding='utf-8').read()
                  for f in sorted(os.listdir('css')) if f.endswith('.css'))
# comments would otherwise be read as part of the selector that follows them
css = re.sub(r'/\*.*?\*/', '', css_raw, flags=re.S)

# ---- markup is well formed -------------------------------------------------
VOID = {'br','hr','img','input','meta','link','source','area','base','col'}
class Check(HTMLParser):
    def __init__(self): super().__init__(); self.stack=[]; self.errs=[]
    def handle_startendtag(self, t, a): pass
    def handle_starttag(self, t, a):
        if t not in VOID: self.stack.append((t, self.getpos()))
    def handle_endtag(self, t):
        if not self.stack: self.errs.append(f'stray </{t}>'); return
        if self.stack[-1][0] != t:
            self.errs.append(f'</{t}> at {self.getpos()} closes <{self.stack[-1][0]}>')
        else: self.stack.pop()

PAGES = ('index.html', 'he/index.html', '404.html')
for page in PAGES:
    p = Check(); p.feed(open(page, encoding='utf-8').read())
    if p.stack or p.errs: fail(f'{page}: markup — {p.errs[:2] or p.stack[:2]}')

# ---- every referenced file exists, from each page's own directory ----------
refs = set()
for page in PAGES:
    base = os.path.dirname(page)
    doc = open(page, encoding='utf-8').read()
    for r in re.findall(r'(?:src|href|srcset)="([^"]+)"', doc):
        for q in r.split(','):
            p = q.strip().split(' ')[0]
            if p.startswith(('assets/', 'css/', 'js/', '../')):
                refs.add((page, os.path.normpath(os.path.join(base, p))))
missing = sorted({p for _, p in refs if not os.path.exists(p)})
if missing: fail(f'missing files: {missing[:4]}')

# ---- the two language pages must stay in step ------------------------------
en_doc = open('index.html', encoding='utf-8').read()
he_doc = open('he/index.html', encoding='utf-8').read()
if 'lang="he" dir="rtl"' not in he_doc: fail('he/index.html is not marked as Hebrew RTL')
if 'lang="en" dir="ltr"' not in en_doc: fail('index.html is not marked as English LTR')
if len(re.findall(r'[\u0590-\u05FF]', en_doc)) > 4:
    fail('english page contains Hebrew body text — regenerate with build-pages.py')
if len(re.findall(r'[\u0590-\u05FF]', he_doc)) < 200:
    fail('hebrew page has almost no Hebrew — regenerate with build-pages.py')
if en_doc.count('data-i18n=') != he_doc.count('data-i18n='):
    fail('the two pages have drifted apart — regenerate with build-pages.py')

# ---- a hidden full-screen layer must not keep its box ----------------------
for m in re.finditer(r'([^{}]+)\{([^}]*)\}', css):
    sel, body = m.group(1).strip(), m.group(2)
    if 'position: fixed' in body and 'inset: 0' in body and re.search(r'opacity:\s*0', body):
        base = sel.split(',')[0].strip().split()[-1]
        guarded = ('visibility: hidden' in body or 'display: none' in body
                   or re.search(re.escape(base) + r'\[hidden\][^{]*\{[^}]*display:\s*none', css))
        if not guarded:
            fail(f'{sel}: covers the viewport while invisible — it will swallow clicks')

# ---- css sanity ------------------------------------------------------------
if css.count('{') != css.count('}'): fail('css: unbalanced braces')
used = set(re.findall(r'var\((--[\w-]+)', css))
declared = set(re.findall(r'(--[\w-]+)\s*:', css))
inline = {'--ar','--pos','--i','--slot-bg','--portrait-col','--chars','--cap','--reveal-dur','--fill-cap'}
undef = sorted(used - declared - inline)
if undef: fail(f'css: undefined variables {undef}')

# ---- accessibility ---------------------------------------------------------
imgs = re.findall(r'<img[^>]*>', html)
if [i for i in imgs if 'alt=' not in i]: fail('images without alt')
if [i for i in imgs if 'width=' not in i or 'height=' not in i]:
    warn('images without explicit width/height — they will shift the layout as they load')
btns = re.findall(r'<button[^>]*>(?:(?!</button>).)*</button>', html, re.S)
unlabelled = [b for b in btns if 'aria-label' not in b and not re.search(r'>[^<]*\w[^<]*<', b)]
if unlabelled: fail(f'{len(unlabelled)} button(s) with no accessible name')

ids = re.findall(r'id="([^"]+)"', html)
dupes = {i for i in ids if ids.count(i) > 1}
if dupes: fail(f'duplicate ids: {sorted(dupes)}')

for anchor in re.findall(r'href="#([^"]+)"', html):
    if f'id="{anchor}"' not in html: fail(f'nav link #{anchor} has no target')

# ---- every <source> and <img> sits inside a <picture> ---------------------
for page in PAGES:
    doc = open(page, encoding='utf-8').read()
    depth, stray = 0, 0
    for tok in re.finditer(r'<picture>|</picture>|<source\b|<img\b', doc):
        t = tok.group(0)
        if t == '<picture>': depth += 1
        elif t == '</picture>': depth -= 1
        elif t == '<source' and depth == 0: stray += 1
    if stray: fail(f'{page}: {stray} <source> outside any <picture>')

# ---- structured data -------------------------------------------------------
ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
if ld:
    try: json.loads(ld.group(1))
    except Exception as e: fail(f'JSON-LD does not parse: {e}')

# ---- the name is spelled the one right way ---------------------------------
strings_raw = open('content/strings.json', encoding='utf-8').read()
if re.search(r'\bLotem\b', en_doc + he_doc + strings_raw):
    fail('name misspelled — it is "Lottem Schefenbauer"')

# ---- anything still hidden behind a script flag ----------------------------
for flag in ('js-reveal', 'js-intro', 'js-imgfade'):
    if flag in css and flag not in open('js/ui.js', encoding='utf-8').read():
        fail(f'.{flag} hides content in css but nothing sets it — content would stay invisible')

# ---- report ----------------------------------------------------------------
print(f'{len(imgs)} images · {len(btns)} buttons · {len(refs)} referenced files\n')
for w in warns: print(f'  warn  {w}')
for f in fails: print(f'  FAIL  {f}')
print()
if fails:
    print(f'{len(fails)} problem(s) to fix before deploying.'); sys.exit(1)
print('All checks passed.' + (f' ({len(warns)} warning)' if warns else ''))
