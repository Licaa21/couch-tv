// Remote diagnostics for the Samsung app (Home settings, Look and scenes, Testing: Debug connection).
//
// Off unless someone types the address of the debug server on the TV (samsung/tools/tvdebug.py serve) and switches it on. While it is on, the app
//   - sends its log (errors, console, what the home did: scenes, fades, pictures and how long they took, weather) to that server,
//   - sends its speed now and then (frames a second, long frames, memory),
//   - and asks the server every few seconds whether there is a command to run: state, dom (what is where, with colours and opacities), shot (a
//     picture of the screen, drawn by html2canvas, so only roughly what the TV paints), eval, perf, key, reload.
// The address is typed as host:port/key (the server prints it). Nothing is sent anywhere else, and nothing secret is sent (settings keys that look
// like keys, tokens or passwords are replaced by ***). Strict ES5 for the TV's browser.
(function () {
  "use strict";
  var W = window, KEY = "couch.dbg", START = Date.now();
  var buf = [], seq = 0, sent = 0, MAXBUF = 1500;
  var conn = { ok: false, err: "", polls: 0, sentTotal: 0 };
  var timers = { flush: 0, poll: 0 }, running = false, gen = 0;

  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  var cfg = load();   // { addr: "192.168.1.50:5410/key", on: true }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  function safe(o) {
    try { return JSON.stringify(o, function (k, v) { return /key|token|pass|secret|api/i.test(k) && typeof v === "string" && v ? "***" : v; }); } catch (e) { return String(o); }
  }
  function add(level, tag, msg) {
    var m = typeof msg === "string" ? msg : safe(msg);
    if (m == null) m = "";
    buf.push({ n: ++seq, t: Date.now(), l: level, g: tag, m: m.length > 1500 ? m.slice(0, 1500) + "..." : m });
    if (buf.length > MAXBUF) buf.splice(0, buf.length - MAXBUF);
  }

  // ---- always: the last errors and console lines are kept (a few KB), so a connection made later still sees what went wrong ----
  ["log", "info", "warn", "error"].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      try { add(k === "error" ? "e" : k === "warn" ? "w" : "i", "console", Array.prototype.slice.call(arguments).map(function (a) { return typeof a === "string" ? a : safe(a); }).join(" ")); } catch (e) {}
      if (orig) try { orig.apply(console, arguments); } catch (e2) {}
    };
  });
  W.addEventListener("error", function (e) { add("e", "error", (e.message || "error") + " at " + String(e.filename || "").split("/").pop() + ":" + e.lineno + ":" + e.colno); });
  W.addEventListener("unhandledrejection", function (e) { add("e", "promise", String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); });

  // ---- the address ----
  function parse() {
    var a = String(cfg.addr || "").trim().replace(/^https?:\/\//, "");
    var m = /^([^\/]+)\/(.+)$/.exec(a);
    return m ? { base: "http://" + m[1], key: encodeURIComponent(m[2]) } : null;
  }

  function xhr(method, url, body, timeout, done) {
    var x = new XMLHttpRequest(), fin = false;
    var end = function (err) { if (fin) return; fin = true; done(err, x.status, x.responseText); };
    try {
      x.open(method, url);
      x.timeout = timeout;
      x.onload = function () { end(null); };
      x.onerror = function () { end(new Error("no answer from the server")); };
      x.ontimeout = function () { end(new Error("timeout")); };
      try { x.setRequestHeader("Content-Type", "text/plain"); } catch (e) {}
      x.send(body == null ? null : body);
    } catch (e) { end(e); }
  }

  // ---- profiler: which callback is slow. Timers, listeners, animation frames and XHR callbacks are wrapped from the start (this file loads before
  // the app), and only time themselves while connected. A callback over 8 ms goes in a ring; over 100 ms it is logged ("slow") with its source; a frame
  // gap over 150 ms is logged ("stall") with every callback that ran in it, so a stall with no callback in it is the browser's own layout or paint. ----
  var prof = { on: !!cfg.on, ring: [], keyAt: 0, keyCode: 0 };
  var rafOrig = W.requestAnimationFrame, cafOrig = W.cancelAnimationFrame;
  function src(fn) { var s = ""; try { s = Function.prototype.toString.call(fn).replace(/\s+/g, " "); } catch (e) {} return s.length > 160 ? s.slice(0, 160) + "..." : s; }
  function took(kind, ms, fn, label) {
    var e = { t: Date.now(), ms: Math.round(ms), k: kind, s: label ? label + " " + src(fn) : src(fn) };
    prof.ring.push(e);
    if (prof.ring.length > 300) prof.ring.splice(0, prof.ring.length - 300);
    if (ms >= 100) add("w", "slow", e.ms + " ms " + kind + ": " + e.s);
  }
  function wrapFn(fn, kind) {
    if (typeof fn !== "function") return fn;
    if (fn.__tvw) return fn.__tvw;
    var w = function () {
      if (!prof.on) return fn.apply(this, arguments);
      var t0 = performance.now(), a0 = arguments[0], label = "";
      if (kind === "ev" && a0 && a0.type) label = a0.type + (a0.keyCode ? "#" + a0.keyCode : "");
      try { return fn.apply(this, arguments); }
      finally { var d = performance.now() - t0; if (d >= 8) took(kind, d, fn, label); }
    };
    try { fn.__tvw = w; } catch (e) {}
    return w;
  }
  W.TVPROF = function (name, fn) {   // the app wraps its own big functions with this, to see them by name
    if (typeof fn !== "function") return fn;
    return function () {
      if (!prof.on) return fn.apply(this, arguments);
      var t0 = performance.now();
      try { return fn.apply(this, arguments); }
      finally { var d = performance.now() - t0; if (d >= 8) took("fn", d, fn, name); }
    };
  };
  if (cfg.on) try {   // only when the connection was already on at load: a page with it off keeps its own timers untouched (switch it on, then reload)
    var st0 = W.setTimeout, si0 = W.setInterval;
    W.setTimeout = function (f) { var a = Array.prototype.slice.call(arguments); a[0] = wrapFn(f, "timeout"); return st0.apply(W, a); };
    W.setInterval = function (f) { var a = Array.prototype.slice.call(arguments); a[0] = wrapFn(f, "interval"); return si0.apply(W, a); };
    W.requestAnimationFrame = function (f) { return rafOrig.call(W, wrapFn(f, "raf")); };
    var ET = W.EventTarget && W.EventTarget.prototype, ael = ET.addEventListener, rel = ET.removeEventListener;
    ET.addEventListener = function (type, f, o) { return ael.call(this, type, wrapFn(f, "ev"), o); };
    ET.removeEventListener = function (type, f, o) { return rel.call(this, type, f && f.__tvw || f, o); };
    ["onload", "onerror", "ontimeout", "onreadystatechange", "onloadend"].forEach(function (n) {
      var d = Object.getOwnPropertyDescriptor(W.XMLHttpRequest.prototype, n) || Object.getOwnPropertyDescriptor(W.XMLHttpRequestEventTarget.prototype, n);
      if (!d || !d.set) return;
      Object.defineProperty(W.XMLHttpRequest.prototype, n, { configurable: true, enumerable: true,
        get: function () { var v = d.get.call(this); return v && v.__tvo || v; },
        set: function (v) { var w = wrapFn(v, "xhr"); if (w !== v && w) w.__tvo = v; d.set.call(this, w); } });
    });
  } catch (eP) { add("e", "profiler", "could not wrap the timers: " + eP); }
  // keys: when one was pressed, so the first frame after it can say how long the screen took to answer
  W.addEventListener("keydown", function (e) { if (prof.on) { prof.keyAt = performance.now(); prof.keyCode = e.keyCode; add("ev", "key", e.keyCode); } }, true);

  // ---- speed: frames a second, long frames, memory, and tasks that block the page (while connected) ----
  var perf = { frames: 0, long: 0, vlong: 0, worst: 0, last: 0, since: 0, raf: 0, on: false };
  function frame(ts) {
    if (!perf.on) return;
    if (perf.last) {
      var dt = ts - perf.last;
      perf.frames++;
      if (dt > 50) perf.long++;
      if (dt > 100) perf.vlong++;
      if (dt > perf.worst) perf.worst = dt;
      if (dt > 150) {
        var from = Date.now() - dt - 30, inside = prof.ring.filter(function (e) { return e.t >= from; });
        add("w", "stall", Math.round(dt) + " ms between frames; " + (inside.length ? inside.map(function (e) { return e.ms + "ms " + e.k + ": " + e.s.slice(0, 90); }).join(" | ") : "no callback over 8 ms ran in it (the browser's own layout or paint)"));
      }
    }
    if (prof.keyAt) { var lag = performance.now() - prof.keyAt; if (lag > 120) add("w", "keylag", Math.round(lag) + " ms from key " + prof.keyCode + " to the next frame"); prof.keyAt = 0; }
    perf.last = ts;
    perf.raf = rafOrig.call(W, frame);
  }
  function perfStart() {
    if (perf.on) return;
    perf.on = true; prof.on = true; perf.frames = perf.long = perf.vlong = perf.worst = 0; perf.last = 0; perf.since = Date.now();
    perf.raf = rafOrig.call(W, frame);
  }
  function perfStop() { perf.on = false; if (perf.raf) cafOrig.call(W, perf.raf); perf.raf = 0; }
  function perfTake() {
    var secs = Math.max(0.001, (Date.now() - perf.since) / 1000);
    var r = { fps: Math.round(perf.frames / secs * 10) / 10, frames: perf.frames, over50ms: perf.long, over100ms: perf.vlong, worstMs: Math.round(perf.worst), secs: Math.round(secs * 10) / 10 };
    try { if (performance.memory) r.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}
    try { r.nodes = document.getElementsByTagName("*").length; } catch (e2) {}
    perf.frames = perf.long = perf.vlong = perf.worst = 0; perf.since = Date.now();
    return r;
  }
  var perfTimer = 0, po = null;
  function observe() {
    if (po || !W.PerformanceObserver) return;
    try {
      po = new W.PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.entryType === "longtask") add("w", "longtask", Math.round(e.duration) + " ms");
          else if (e.entryType === "resource" && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(e.name) && e.duration > 1500) add("w", "slowpic", Math.round(e.duration) + " ms " + e.name.split("/").slice(-2).join("/"));
        });
      });
      po.observe({ entryTypes: ["longtask", "resource"] });
    } catch (e) { po = null; try { var p2 = new W.PerformanceObserver(function () {}); p2.disconnect(); } catch (e2) {} }
  }
  function unobserve() { if (po) { try { po.disconnect(); } catch (e) {} po = null; } }

  // ---- what the screen is made of ----
  function short(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "..." : s; }
  function domTree() {
    var out = [], vw = W.innerWidth, vh = W.innerHeight;
    function walk(el, depth) {
      if (out.length >= 600 || depth > 10 || el.nodeType !== 1) return;
      var cs = W.getComputedStyle(el);
      if (cs.display === "none") return;
      var r = el.getBoundingClientRect(), tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "link" || tag === "meta") return;
      var o = { d: depth, e: tag + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".") : "") };
      o.r = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      if (cs.opacity !== "1") o.op = cs.opacity;
      if (cs.visibility !== "visible") o.vis = cs.visibility;
      if (cs.color && depth > 0 && !el.children.length) o.c = cs.color;
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") o.bg = cs.backgroundColor;
      if (cs.backgroundImage && cs.backgroundImage !== "none") o.bgi = short(cs.backgroundImage.replace(/url\(["']?|["']?\)/g, "").split("/").slice(-3).join("/"), 80);
      if (cs.filter && cs.filter !== "none") o.f = cs.filter;
      if (cs.transform && cs.transform !== "none") o.tf = short(cs.transform, 60);
      if (cs.zIndex && cs.zIndex !== "auto") o.z = cs.zIndex;
      if (tag === "img") { o.src = short((el.getAttribute("src") || "").split("/").slice(-3).join("/"), 80); o.nat = el.naturalWidth + "x" + el.naturalHeight; o.done = !!el.complete; }
      if (!el.children.length && el.textContent) o.t = short(el.textContent.trim(), 60);
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) o.off = 1;
      out.push(o);
      for (var i = 0; i < el.children.length; i++) walk(el.children[i], depth + 1);
    }
    walk(document.body, 0);
    return { w: vw, h: vh, dpr: W.devicePixelRatio, n: out.length, nodes: out };
  }

  var h2c = null;
  function shot(arg, done) {
    var run = function () {
      var o = { scale: 0.5, useCORS: true, backgroundColor: "#000", logging: false, x: 0, y: 0, scrollX: 0, scrollY: 0, width: W.innerWidth, height: W.innerHeight, windowWidth: W.innerWidth, windowHeight: W.innerHeight };
      if (arg && arg.scale) o.scale = +arg.scale;
      W.html2canvas(document.documentElement, o).then(function (cv) {
        done(null, { img: cv.toDataURL("image/jpeg", 0.62), w: cv.width, h: cv.height, note: "drawn by html2canvas: layout and colours are real, masks, blurs and some filters are not" });
      }, function (e) { done(String(e)); });
    };
    if (W.html2canvas) return run();
    if (h2c) return h2c.push(run);
    h2c = [run];
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = function () { var q = h2c; h2c = null; q.forEach(function (f) { f(); }); };
    s.onerror = function () { var q = h2c; h2c = null; done("could not load html2canvas (needs internet)"); q = null; };
    document.head.appendChild(s);
  }

  function stateNow() {
    var s = {};
    try { s = W.tv && W.tv.debugState ? W.tv.debugState() : {}; } catch (e) { s = { error: String(e) }; }
    s.up = Math.round((Date.now() - START) / 1000);
    s.screen = [W.innerWidth, W.innerHeight, W.devicePixelRatio];
    s.ua = navigator.userAgent;
    try { if (performance.memory) s.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e2) {}
    return s;
  }

  function fireKey(code) {
    var types = ["keydown", "keyup"];
    types.forEach(function (ty) {
      var ev = document.createEvent("Event");
      ev.initEvent(ty, true, true);
      ev.keyCode = ev.which = code;
      try { Object.defineProperty(ev, "keyCode", { get: function () { return code; } }); Object.defineProperty(ev, "which", { get: function () { return code; } }); } catch (e) {}
      document.dispatchEvent(ev);
    });
  }

  // ---- commands from the server ----
  function run(c, done) {
    var a = c.arg;
    try {
      if (c.cmd === "ping") return done(null, { ok: true, up: Math.round((Date.now() - START) / 1000) });
      if (c.cmd === "state") return done(null, stateNow());
      if (c.cmd === "dom") return done(null, domTree());
      if (c.cmd === "logs") { var n = +a || 100; return done(null, buf.slice(-n)); }
      if (c.cmd === "key") { fireKey(+a); return done(null, { ok: true, key: +a }); }
      if (c.cmd === "ui") return done(null, W.tv && W.tv.debugUi ? W.tv.debugUi() : { error: "no ui" });
      if (c.cmd === "focus") return done(null, W.tv.debugFocus(a && a.what, a && a.i));
      if (c.cmd === "settings") return done(null, W.tv.debugSettings(a && a.section, a && a.row));
      if (c.cmd === "press") {   // keys by name or number, n times, with a short pause between them; the answer is the screen's state after the last one
        var codes = { up: 38, down: 40, left: 37, right: 39, ok: 13, enter: 13, back: 10009, home: 36, menu: 10133 }, kc = codes[String(a.key).toLowerCase()] || +a.key, left = Math.max(1, +a.n || 1);
        var step = function () {
          fireKey(kc);
          if (--left > 0) return setTimeout(step, 180);
          setTimeout(function () { done(null, W.tv.debugUi ? W.tv.debugUi() : { ok: true }); }, 400);
        };
        return step();
      }
      if (c.cmd === "reload") { done(null, { ok: true }); return setTimeout(function () { location.reload(); }, 300); }
      if (c.cmd === "shot") return shot(a, done);
      if (c.cmd === "perf") {
        var secs = Math.max(1, Math.min(60, +a || 10)), was = perf.on;
        perfStart(); perfTake();
        return setTimeout(function () { var r = perfTake(); if (!was) perfStop(); done(null, r); }, secs * 1000);
      }
      if (c.cmd === "eval") {
        var v;
        try { v = new Function("return (" + a + "\n)")(); } catch (e1) { v = new Function(a)(); }
        if (v && typeof v.then === "function") return v.then(function (r) { done(null, r); }, function (e) { done(String(e)); });
        return done(null, v === undefined ? "undefined" : v);
      }
      done("unknown command " + c.cmd);
    } catch (e) { done(String(e && e.stack || e)); }
  }

  function flush(g) {
    if (g !== gen) return;
    var p = parse();
    if (!p) return;
    var fresh = buf.filter(function (e) { return e.n > sent; });
    if (!fresh.length) { timers.flush = setTimeout(function () { flush(g); }, 1500); return; }
    var last = fresh[fresh.length - 1].n;
    xhr("POST", p.base + "/log?k=" + p.key, JSON.stringify(fresh), 8000, function (err) {
      if (g !== gen) return;
      if (err) { conn.ok = false; conn.err = err.message; } else { sent = last; conn.ok = true; conn.err = ""; conn.sentTotal += fresh.length; }
      timers.flush = setTimeout(function () { flush(g); }, err ? 4000 : 1500);
    });
  }
  function poll(g) {
    if (g !== gen) return;
    var p = parse();
    if (!p) return;
    xhr("GET", p.base + "/cmd?k=" + p.key, null, 32000, function (err, status, text) {
      if (g !== gen) return;
      if (err || status >= 400) { conn.ok = false; conn.err = err ? err.message : "server said " + status; timers.poll = setTimeout(function () { poll(g); }, 4000); return; }
      conn.ok = true; conn.err = ""; conn.polls++;
      if (status !== 200 || !text) { timers.poll = setTimeout(function () { poll(g); }, 50); return; }
      var c = null;
      try { c = JSON.parse(text); } catch (e) {}
      if (!c) { timers.poll = setTimeout(function () { poll(g); }, 300); return; }
      run(c, function (e2, res) {
        var body = e2 ? { id: c.id, error: String(e2) } : { id: c.id, result: res };
        var s;
        try { s = JSON.stringify(body); } catch (e3) { s = JSON.stringify({ id: c.id, error: "result not serialisable" }); }
        xhr("POST", p.base + "/result?k=" + p.key + "&id=" + encodeURIComponent(c.id), s, 20000, function () {
          timers.poll = setTimeout(function () { poll(g); }, 20);
        });
      });
    });
  }

  function start() {
    if (running || !cfg.on || !parse()) return;
    running = true; gen++;
    add("i", "debug", "connected to the debug server");
    observe(); perfStart();
    var g = gen;
    flush(g); poll(g);
    perfTimer = setInterval(function () { var r = perfTake(); add("i", "perf", r); }, 10000);
  }
  function stop() {
    if (!running) return;
    running = false; gen++;
    clearTimeout(timers.flush); clearTimeout(timers.poll); clearInterval(perfTimer);
    perfStop(); unobserve(); prof.on = false;
    conn.ok = false;
  }

  W.TVDBG = {
    log: function (tag, data) { add("ev", tag, data); },
    status: function () { return { on: !!cfg.on, addr: cfg.addr || "", ok: conn.ok, err: conn.err, sent: conn.sentTotal, buffered: buf.length }; },
    config: function (addr) { cfg.addr = String(addr || "").trim(); save(); stop(); start(); },
    setOn: function (on) { cfg.on = !!on; save(); if (cfg.on) start(); else stop(); },
    tail: function (n) { return buf.slice(-(n || 50)); }
  };
  add("i", "debug", "app started");
  if (cfg.on) setTimeout(start, 3000);   // after the home has drawn
}());
