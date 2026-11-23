#!/usr/bin/env python3
"""Local helpers for n8n: FF news fetch (wget) + feature flags + telegram admin helpers."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import subprocess, time, os, tempfile, json, urllib.parse, urllib.request, re

URL = "https://www.forexfactory.com/news?sc_lang=en"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
CACHE_TTL = 45
FLAGS_DIR = "/opt/n8n/local-files"
TOKEN_PATH = "/opt/n8n/local-files/.tg_bot_token"
ALLOWED_FLAGS = {"news-effect", "gold-alert"}
_cache = {"at": 0.0, "body": b"", "status": 502}

def fetch():
    with tempfile.NamedTemporaryFile(prefix="ffnews-", suffix=".html", delete=False) as tmp:
        path = tmp.name
    try:
        cmd = [
            "wget", "-qO", path, "-T", "25",
            "--header", f"User-Agent: {UA}",
            "--header", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "--header", "Accept-Language: en-US,en;q=0.9",
            "--header", "Cache-Control: no-cache",
            URL,
        ]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) < 1000:
            return 502, b"fetch failed: " + (p.stderr or p.stdout or "empty").encode()
        with open(path, "rb") as f:
            body = f.read()
        if b"Just a moment" in body and b"News / Latest Stories" not in body:
            return 503, b"cloudflare challenge"
        return 200, body
    finally:
        try: os.unlink(path)
        except OSError: pass

def flag_path(name: str) -> str:
    return os.path.join(FLAGS_DIR, name.replace("-", "_") + "_enabled.json")

def read_flag(name: str, default=True) -> bool:
    try:
        with open(flag_path(name), "r", encoding="utf-8") as f:
            data = json.load(f)
        return bool(data.get("enabled", default))
    except Exception:
        return bool(default)

def write_flag(name: str, enabled: bool):
    os.makedirs(FLAGS_DIR, exist_ok=True)
    path = flag_path(name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"enabled": bool(enabled)}, f)
    os.replace(tmp, path)

def bot_token():
    with open(TOKEN_PATH, "r", encoding="utf-8") as f:
        return f.read().strip()

def tg_api(method, payload):
    token = bot_token()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args), flush=True)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/health":
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers(); self.wfile.write(b"ok"); return
        m = re.match(r"^/flags/([a-z0-9-]+)$", path)
        if m:
            name = m.group(1)
            if name not in ALLOWED_FLAGS:
                self._json(404, {"ok": False, "error": "unknown flag"}); return
            self._json(200, {"enabled": read_flag(name), "flag": name}); return
        if path != "/news":
            self.send_response(404); self.end_headers(); return
        now = time.time()
        if now - _cache["at"] > CACHE_TTL or _cache["status"] != 200:
            status, body = fetch()
            _cache.update(at=now, body=body, status=status)
        self.send_response(_cache["status"])
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(_cache["body"])))
        self.end_headers()
        self.wfile.write(_cache["body"])

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            data = self._read_json()
        except Exception:
            self._json(400, {"ok": False, "error": "invalid json"}); return
        m = re.match(r"^/flags/([a-z0-9-]+)$", path)
        if m:
            name = m.group(1)
            if name not in ALLOWED_FLAGS:
                self._json(404, {"ok": False, "error": "unknown flag"}); return
            if "enabled" not in data:
                self._json(400, {"ok": False, "error": "missing enabled"}); return
            write_flag(name, bool(data["enabled"]))
            self._json(200, {"ok": True, "enabled": read_flag(name), "flag": name}); return
        if path == "/tg/sendMessage":
            self._json(200, tg_api("sendMessage", data)); return
        if path == "/tg/answerCallbackQuery":
            self._json(200, tg_api("answerCallbackQuery", data)); return
        self.send_response(404); self.end_headers()

if __name__ == "__main__":
    # migrate legacy news flag filename if present
    legacy = os.path.join(FLAGS_DIR, "news_effect_enabled.json")
    target = flag_path("news-effect")
    if os.path.exists(legacy) and not os.path.exists(target):
        try:
            os.rename(legacy, target)
        except OSError:
            pass
    # default gold alert ON
    if not os.path.exists(flag_path("gold-alert")):
        write_flag("gold-alert", True)
    host, port = "0.0.0.0", 18765
    print(f"ff-news-proxy on {host}:{port} flags={sorted(ALLOWED_FLAGS)}", flush=True)
    ThreadingHTTPServer((host, port), H).serve_forever()
