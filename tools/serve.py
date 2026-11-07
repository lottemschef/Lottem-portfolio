#!/usr/bin/env python3
"""
The local preview server: `python3 -m http.server`, plus the two things a page
full of video needs from it.

    python3 tools/serve.py 5175

`python3 -m http.server` speaks HTTP/1.0 and ignores Range. Every video that
starts playing is therefore sent whole, down a connection of its own that
stays open while the file trickles in, and a browser opens six connections
to a host. Scroll past six films and the six are taken: every photograph below
waits behind them, and the grading wipe and the carousel come up black. A real
host (GitHub Pages included) answers Range with 206 and the browser fetches
only what it plays, so the preview should do the same or it is not showing
the site as visitors see it.

This answers Range with 206 Partial Content and keeps connections alive
(HTTP/1.1), one thread per connection. Nothing else changes.
"""
import os
import re
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_head(self):
        self._range = None
        header = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not header or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()

        m = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:                                   # bytes=-N: the last N bytes
            start, end = max(0, size - int(m.group(2))), size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        f = open(path, "rb")
        f.seek(start)
        self._range = end - start + 1
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self._range))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        self.end_headers()
        return f

    def end_headers(self):
        # say so on whole-file answers too, or the browser never asks for a range
        if not getattr(self, "_range", None):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_range", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def log_message(self, *args):
        pass                                    # a scroll is hundreds of requests


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5175
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    ThreadingHTTPServer.daemon_threads = True
    with ThreadingHTTPServer(("", port), RangeHandler) as httpd:
        print(f"Serving on http://localhost:{port}/  (Range + keep-alive)")
        httpd.serve_forever()
