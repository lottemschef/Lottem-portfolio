#!/usr/bin/env python3
"""
Collects the files a visitor's browser can actually ask for into one folder,
and nothing else. The deploy publishes that folder rather than the repository.

    python3 tools/collect-site.py _site

The repository is 518MB and the pages use about half of it. The rest was being
published too: 168MB of photograph masters at full resolution in
assets/photos/, two films the page no longer plays, image sizes nothing points
at, and the build scripts and the template. Anyone could download the masters.

What goes in is read from the pages themselves, not from a list kept by hand:
every src, srcset, poster, href and data- source in index.html, he/index.html
and 404.html, every url() in the stylesheets, and the og:image the link
previews fetch. A new photograph is published by being linked, and a removed
one stops being published by being unlinked.

A page that points at a file which does not exist stops the deploy, rather
than publishing a broken link.
"""
import os
import re
import shutil
import sys
from urllib.parse import urlsplit, unquote

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SITE = "https://lottemschef.github.io/Lottem-portfolio/"

PAGES = ["index.html", "he/index.html", "404.html"]
ALWAYS = ["robots.txt", "sitemap.xml", ".nojekyll"]

# attributes that name a file, one URL each; content= only where it is one of
# this site's own URLs (og:image), not a description
SINGLE = re.compile(r'\b(?:src|href|poster|data-src)="([^"]+)"|\bcontent="(https://lottemschef\.github\.io/[^"]+)"')
# attributes that name several, as "url 640w, url 1280w"
LISTS = re.compile(r'\b(?:srcset|data-poster-set)="([^"]+)"')
CSS_URL = re.compile(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)')


def local(url, base_dir):
    """The repository path a URL on a page at base_dir resolves to, or None."""
    url = url.strip()
    if url.startswith(SITE):
        url = "/" + url[len(SITE):]
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path or url.startswith(("#", "data:")):
        return None
    path = unquote(parts.path)
    if path.startswith("/Lottem-portfolio/"):
        path = path[len("/Lottem-portfolio"):]
    joined = path.lstrip("/") if path.startswith("/") else os.path.join(base_dir, path)
    rel = os.path.normpath(joined)
    if rel.startswith(".."):
        return None
    return rel


def refs_in_page(page):
    html = open(os.path.join(ROOT, page), encoding="utf-8").read()
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)   # comments name files in passing
    base = os.path.dirname(page)
    found = set()
    for attr, meta in SINGLE.findall(html):
        found.add(local(attr or meta, base))
    for group in LISTS.findall(html):
        for candidate in group.split(","):
            if candidate.strip():
                found.add(local(candidate.split()[0], base))
    return {f for f in found if f}


def refs_in_css(sheet):
    css = open(os.path.join(ROOT, sheet), encoding="utf-8").read()
    return {f for f in (local(u, os.path.dirname(sheet)) for u in CSS_URL.findall(css)) if f}


def main(out):
    out = os.path.abspath(out)
    if os.path.exists(out):
        shutil.rmtree(out)

    wanted = set(PAGES) | set(ALWAYS)
    for page in PAGES:
        wanted |= refs_in_page(page)
    for sheet in [f for f in wanted if f.endswith(".css")]:
        wanted |= refs_in_css(sheet)

    # a page's own address (its canonical link, "../" for the language switch)
    # is a directory, not a file to copy
    wanted = {f for f in wanted if not os.path.isdir(os.path.join(ROOT, f))}

    missing = sorted(f for f in wanted if not os.path.isfile(os.path.join(ROOT, f)))
    if missing:
        sys.exit("collect-site: pages link to files that do not exist:\n  " + "\n  ".join(missing))

    size = 0
    for rel in sorted(wanted):
        dest = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dest)
        size += os.path.getsize(dest)
    print(f"collect-site: {len(wanted)} files, {size / 1048576:.1f} MB -> {os.path.relpath(out)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
