"""Diagnostics for the Samsung app: a small server the TV talks to, and a command line to read its log and look at its screen.

    python samsung/tools/tvdebug.py serve              start the server (leave it running); it prints what to type on the TV
    python samsung/tools/tvdebug.py status             is the TV connected?
    python samsung/tools/tvdebug.py logs [-n 200] [-f] [--grep text] [--tag scene]
    python samsung/tools/tvdebug.py state              the app's own state (scene, fades, weather, settings, sizes)
    python samsung/tools/tvdebug.py dom                what is on the screen: every box, where, its colour, opacity, picture
    python samsung/tools/tvdebug.py shot [file.jpg]    a picture of the screen (html2canvas: layout and colours real, masks and blurs not)
    python samsung/tools/tvdebug.py perf [seconds]     frames a second, long frames, memory over that time
    python samsung/tools/tvdebug.py eval "<javascript>"  run something in the app and print the answer
    python samsung/tools/tvdebug.py key 13             press a key (13 OK, 37 left, 38 up, 39 right, 40 down, 10009 back)
    python samsung/tools/tvdebug.py reload

On the TV: Home settings, Look and scenes, Testing, Debug connection: type the address `serve` prints (host:port/key), then switch
"Send logs" on. The TV and this computer must be on the same network. Only this computer can give commands (the command line talks to
the server on 127.0.0.1); the TV's requests need the key. Everything the server hears is also written to tvdebug.log (one JSON per line).
Stdlib only.
"""
import argparse
import base64
import json
import os
import secrets
import socket
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
KEYFILE = os.path.join(os.path.expanduser("~"), ".tvdebug-key")
LOGFILE = os.path.join(os.getcwd(), "tvdebug.log")
PORT = 5410

COND = threading.Condition()
LOGS = []          # everything the TV sent: {n, t, l, g, m, at}
CMDS = []          # commands waiting for the TV: {id, cmd, arg}
RESULTS = {}       # id -> {result|error}
SEEN = {"last": 0.0, "first": 0.0}
KEY = ""


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def get_key():
    try:
        with open(KEYFILE, encoding="utf-8") as f:
            k = f.read().strip()
            if k:
                return k
    except OSError:
        pass
    k = secrets.token_urlsafe(8).replace("-", "a").replace("_", "b")
    with open(KEYFILE, "w", encoding="utf-8") as f:
        f.write(k)
    return k


class H(BaseHTTPRequestHandler):
    server_version = "tvdebug"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send(self, code, obj=None):
        body = b"" if obj is None else json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _local(self):
        return self.client_address[0] in ("127.0.0.1", "::1")

    def _query(self):
        u = urllib.parse.urlparse(self.path)
        return u.path, dict(urllib.parse.parse_qsl(u.query))

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n).decode("utf-8", "replace") if n else ""

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        path, q = self._query()
        if path == "/cmd":                                   # the TV asks for work
            if q.get("k") != KEY:
                return self._send(403, {"error": "key"})
            now = time.time()
            with COND:
                if not SEEN["first"] or now - SEEN["last"] > 60:
                    SEEN["first"] = now
                SEEN["last"] = now
                end = now + 25
                while not CMDS and time.time() < end:
                    COND.wait(timeout=1.0)
                    SEEN["last"] = time.time()
                if CMDS:
                    return self._send(200, CMDS.pop(0))
            return self._send(204)
        if not self._local():
            return self._send(403, {"error": "local only"})
        if path == "/admin/status":
            ago = time.time() - SEEN["last"] if SEEN["last"] else None
            return self._send(200, {"connected": ago is not None and ago < 40, "seconds_since_tv_seen": None if ago is None else round(ago, 1), "logs": len(LOGS), "queued": len(CMDS)})
        if path == "/admin/logs":
            since = int(q.get("since") or 0)
            with COND:
                out = [e for e in LOGS if e["sn"] > since]
            return self._send(200, out)
        self._send(404, {"error": "no such thing"})

    def do_POST(self):
        path, q = self._query()
        body = self._body()
        if path == "/log":
            if q.get("k") != KEY:
                return self._send(403, {"error": "key"})
            try:
                items = json.loads(body)
            except ValueError:
                return self._send(400, {"error": "json"})
            now = time.time()
            with COND:
                SEEN["last"] = now
                for e in items:
                    e["sn"] = len(LOGS) + 1
                    e["at"] = now
                    LOGS.append(e)
                    try:
                        with open(LOGFILE, "a", encoding="utf-8") as f:
                            f.write(json.dumps(e, ensure_ascii=False) + "\n")
                    except OSError:
                        pass
                COND.notify_all()
            return self._send(200, {"ok": True})
        if path == "/result":
            if q.get("k") != KEY:
                return self._send(403, {"error": "key"})
            try:
                r = json.loads(body)
            except ValueError:
                r = {"error": "bad result"}
            with COND:
                RESULTS[q.get("id", "")] = r
                COND.notify_all()
            return self._send(200, {"ok": True})
        if not self._local():
            return self._send(403, {"error": "local only"})
        if path == "/admin/cmd":
            try:
                c = json.loads(body)
            except ValueError:
                return self._send(400, {"error": "json"})
            cid = secrets.token_hex(4)
            timeout = float(c.get("timeout") or 20)
            with COND:
                CMDS.append({"id": cid, "cmd": c["cmd"], "arg": c.get("arg")})
                COND.notify_all()
                end = time.time() + timeout
                while cid not in RESULTS and time.time() < end:
                    COND.wait(timeout=0.5)
                if cid in RESULTS:
                    return self._send(200, RESULTS.pop(cid))
                CMDS[:] = [x for x in CMDS if x["id"] != cid]
            return self._send(504, {"error": "the TV did not answer (is it connected? try: status)"})
        self._send(404, {"error": "no such thing"})


def serve(port):
    global KEY
    KEY = get_key()
    srv = ThreadingHTTPServer(("0.0.0.0", port), H)
    ip = lan_ip()
    print("tvdebug server on port %d" % port)
    print("On the TV: Home settings, Look and scenes, Testing, Debug connection. Type:\n\n    %s:%d/%s\n\nthen switch Send logs on." % (ip, port, KEY))
    print("Log file: %s\nCtrl+C stops it." % LOGFILE)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def admin(path, data=None, timeout=30):
    url = "http://127.0.0.1:%d%s" % (PORT, path)
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode("utf-8"), method="GET" if data is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except ValueError:
            return {"error": "server said %d" % e.code}
    except OSError:
        sys.exit("The server is not running. Start it first:  python samsung/tools/tvdebug.py serve")


def command(cmd, arg=None, timeout=25):
    r = admin("/admin/cmd", {"cmd": cmd, "arg": arg, "timeout": timeout}, timeout + 5)
    if r.get("error"):
        sys.exit("error: " + str(r["error"]))
    return r.get("result")


def line(e):
    t = time.strftime("%H:%M:%S", time.localtime(e["t"] / 1000.0)) + ".%03d" % (e["t"] % 1000)
    return "%s %-2s %-9s %s" % (t, e.get("l", ""), e.get("g", ""), e.get("m", ""))


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    global PORT
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=5410)
    sub = ap.add_subparsers(dest="c", required=True)
    sub.add_parser("serve")
    sub.add_parser("status")
    p = sub.add_parser("logs")
    p.add_argument("-n", type=int, default=100)
    p.add_argument("-f", action="store_true")
    p.add_argument("--grep", default="")
    p.add_argument("--tag", default="")
    sub.add_parser("state")
    sub.add_parser("dom")
    p = sub.add_parser("shot")
    p.add_argument("file", nargs="?", default="")
    p.add_argument("--scale", type=float, default=0.5)
    p = sub.add_parser("perf")
    p.add_argument("seconds", nargs="?", type=int, default=10)
    p = sub.add_parser("eval")
    p.add_argument("js")
    p = sub.add_parser("key")
    p.add_argument("code", type=int)
    sub.add_parser("reload")
    a = ap.parse_args()
    PORT = a.port
    if a.c == "serve":
        return serve(a.port)
    if a.c == "status":
        print(json.dumps(admin("/admin/status"), indent=1))
    elif a.c == "logs":
        since = 0
        first = True
        while True:
            items = admin("/admin/logs?since=%d" % since)
            if items:
                since = items[-1]["sn"]
            sel = [e for e in items if (not a.grep or a.grep.lower() in line(e).lower()) and (not a.tag or e.get("g") == a.tag)]
            if first:
                sel = sel[-a.n:]
                first = False
            for e in sel:
                print(line(e))
            if not a.f:
                break
            sys.stdout.flush()
            time.sleep(1)
    elif a.c in ("state", "dom"):
        print(json.dumps(command(a.c), indent=1, ensure_ascii=False))
    elif a.c == "shot":
        r = command("shot", {"scale": a.scale}, 60)
        name = a.file or time.strftime("tvshot-%H%M%S.jpg")
        with open(name, "wb") as f:
            f.write(base64.b64decode(r["img"].split(",", 1)[1]))
        print("saved %s (%dx%d). %s" % (os.path.abspath(name), r["w"], r["h"], r.get("note", "")))
    elif a.c == "perf":
        print(json.dumps(command("perf", a.seconds, a.seconds + 15), indent=1))
    elif a.c == "eval":
        print(json.dumps(command("eval", a.js), indent=1, ensure_ascii=False))
    elif a.c == "key":
        print(json.dumps(command("key", a.code)))
    elif a.c == "reload":
        print(json.dumps(command("reload")))


if __name__ == "__main__":
    main()
