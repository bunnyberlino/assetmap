"""Local no-cache static server for development/testing only.
The app itself is meant to be opened from file:// — this exists so browser
automation can reach it.  python3 tools/devserver.py [port]"""
import http.server, sys, functools, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
