// Keep watching from your own Jellyfin server, opened in the Moonfin app on this TV. No computer.
// Nothing is baked into the app: the server address, API key and user name are typed on the TV
// (Home settings, Jellyfin) and kept in this app's own storage on the TV. Loads before tizen.js, which
// hands the home its rows (TVOS.watchNext) and opens a card (TVOS.openWatchNext) through this.
(function () {
  "use strict";
  var CFG = "couch.jf", ROWS = "couch.jf.rows", MOON = "MoonfinApp.moonfin", MAX = 20, PER = 12;
  var busy = false, lastTry = 0, problem = "";   // problem: why the last read failed ("net", "key", "user", "http")

  function t(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function toast(s) { if (window.TVOS && window.TVOS.toast) window.TVOS.toast(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Moonfin's id on this TV: found by name in the apps list (tizen.js keeps it), else its usual one.
  function moonId() {
    var hit = (read("couch.tizen.apps") || []).filter(function (a) {
      return /^moonfin/i.test(a.name || "") && !/service/i.test((a.id || "") + (a.name || ""));
    })[0];
    return hit ? hit.id : MOON;
  }

  function normalize(s) {
    s = String(s || "").trim().replace(/\/+$/, "");
    return s && !/^https?:\/\//i.test(s) ? "http://" + s : s;
  }

  // done(err, json): err is "net", "key" (the server refused the key) or "http"
  function get(cfg, path, done) {
    var x = new XMLHttpRequest();
    x.open("GET", cfg.server + path);
    x.setRequestHeader("Authorization", 'MediaBrowser Client="Couch TV", Device="Samsung TV", DeviceId="couch-tv-samsung", Version="1.0", Token="' +
      String(cfg.key).replace(/[^\w-]/g, "") + '"');
    x.timeout = 12000;
    x.onload = function () {
      if (x.status === 401 || x.status === 403) return done("key");
      if (x.status < 200 || x.status > 299) return done("http");
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) { return done("http"); }
      done(null, j);
    };
    x.onerror = x.ontimeout = function () { done("net"); };
    x.send();
  }

  // An API key belongs to no user, so the user name picks whose list to read (one user needs no name).
  function withUser(cfg, done) {
    if (cfg.uid) return done(null, cfg);
    get(cfg, "/Users", function (err, list) {
      if (err) return done(err);
      var want = (cfg.user || "").toLowerCase();
      var u = want ? list.filter(function (x) { return (x.Name || "").toLowerCase() === want; })[0] : (list.length === 1 ? list[0] : null);
      if (!u) return done("user");
      cfg.uid = u.Id;
      done(null, cfg);
    });
  }

  // What the server is asked for with each item: both kinds of picture tags (a show's own for its episodes), the
  // play position and the length. Without these a real server leaves out the show-level pictures, and the
  // posters (a show's cover) were missing.
  var FIELDS = "PrimaryImageAspectRatio,ImageTags,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId," +
    "SeriesPrimaryImageTag,ParentPrimaryImageTag,SeriesName,SeriesId,ParentIndexNumber,IndexNumber,UserData,RunTimeTicks";

  function image(cfg, it) {
    var id = it.Id, type, tag;
    if (it.BackdropImageTags && it.BackdropImageTags[0]) { type = "Backdrop"; tag = it.BackdropImageTags[0]; }
    else if (it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]) { id = it.ParentBackdropItemId; type = "Backdrop"; tag = it.ParentBackdropImageTags[0]; }
    else if (it.ImageTags && it.ImageTags.Thumb) { type = "Thumb"; tag = it.ImageTags.Thumb; }
    else if (it.ImageTags && it.ImageTags.Primary) { type = "Primary"; tag = it.ImageTags.Primary; }
    else return null;
    return cfg.server + "/Items/" + id + "/Images/" + type + "?fillWidth=480&quality=80&tag=" + tag;
  }

  // The tall cover: a film's own, a show's for its episodes. Cards show it until they are focused.
  function poster(cfg, it) {
    var id = it.Id, tag;
    if (it.Type === "Episode") { id = it.SeriesId; tag = it.SeriesPrimaryImageTag; }
    else tag = it.ImageTags && it.ImageTags.Primary;
    return tag && id ? cfg.server + "/Items/" + id + "/Images/Primary?fillHeight=260&quality=85&tag=" + tag : null;
  }

  // One Jellyfin item as a Keep watching card. "jf" is what Moonfin's own Smart Hub tiles carry.
  function card(cfg, it, app) {
    var ep = it.Type === "Episode";
    var jf = { serverid: it.ServerId, id: it.Id, type: ep ? "episode" : "movie" };
    if (ep) { jf.seasonid = it.SeasonId; jf.seriesid = it.SeriesId; }
    var run = it.RunTimeTicks || 0, pos = (it.UserData && it.UserData.PlaybackPositionTicks) || 0;
    return {
      id: it.Id, wn: true, app: app, jf: jf,
      title: ep ? (it.SeriesName || it.Name) : it.Name,
      episode_title: ep ? it.Name : null,
      season: ep ? it.ParentIndexNumber : null, episode: ep ? it.IndexNumber : null,
      progress: it.UserData && it.UserData.PlayedPercentage ? it.UserData.PlayedPercentage / 100 : 0,
      next: !!it._next,   // an episode not started yet, from Next up
      left: run && pos ? Math.max(1, Math.round((run - pos) / 600000000)) : 0,   // minutes left
      backdrop: image(cfg, it), poster: poster(cfg, it)
    };
  }

  // ---------- the pictures kept on the TV, for when the server is off ----------
  // The server comes first, always. Each time the row is read from it, its pictures are saved here (the saved
  // set is replaced, so it only ever holds what the row shows) and the time is noted. Only when the server
  // cannot be reached are the saved copies shown instead, and after three days without it they are dropped.
  var IDB = "couch-jf", AT = "couch.jf.at", TTL = 3 * 86400000;
  var db = null, saved = {}, down = false, lastUpdate = 0;   // saved: a picture's server address -> its saved copy

  function idb(cb) {
    if (db) return cb(db);
    try {
      var r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("img", { keyPath: "u" }); };
      r.onsuccess = function () { db = r.result; cb(db); };
      r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function allSaved(cb) {
    idb(function (d) {
      if (!d) return cb([]);
      var out = [];
      try {
        var cur = d.transaction("img").objectStore("img").openCursor();
        cur.onsuccess = function (ev) { var c = ev.target.result; if (c) { out.push(c.value); c.continue(); } else cb(out); };
        cur.onerror = function () { cb(out); };
      } catch (e) { cb(out); }
    });
  }
  function putImg(u, blob) { idb(function (d) { try { if (d) d.transaction("img", "readwrite").objectStore("img").put({ u: u, blob: blob }); } catch (e) {} }); }
  function delImg(u) { idb(function (d) { try { if (d) d.transaction("img", "readwrite").objectStore("img").delete(u); } catch (e) {} }); }
  function clearImgs() { idb(function (d) { try { if (d) d.transaction("img", "readwrite").objectStore("img").clear(); } catch (e) {} }); }
  function keep(u, blob) { try { if (saved[u]) URL.revokeObjectURL(saved[u]); saved[u] = URL.createObjectURL(blob); } catch (e) {} }
  function stale() { var at = parseInt(localStorage.getItem(AT) || "0", 10); return !!at && Date.now() - at > TTL; }
  function blobOf(u, cb) {
    var x = new XMLHttpRequest();
    x.open("GET", u);
    x.responseType = "blob";
    x.timeout = 15000;
    x.onload = function () { cb(x.status === 200 && x.response ? x.response : null); };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }

  // Load what was saved last time (and drop it if the server has been off for days).
  function preload() {
    if (stale()) { clearImgs(); return; }
    allSaved(function (list) {
      list.forEach(function (r) { keep(r.u, r.blob); });
      if (down) redraw();
    });
  }
  // The row was just read from the server: make the saved set match it.
  var syncing = false;
  function syncImages(urls) {
    if (syncing) return;   // the last pass is still going (a slow TV); the next refresh will catch up
    syncing = true;
    setTimeout(function () { syncing = false; }, 60000);   // never stuck if a pass dies half way
    var want = {};
    urls.forEach(function (u) { if (u) want[u] = true; });
    allSaved(function (list) {
      var have = {};
      list.forEach(function (r) {
        if (want[r.u]) have[r.u] = true;
        else { delImg(r.u); if (saved[r.u]) { try { URL.revokeObjectURL(saved[r.u]); } catch (e) {} delete saved[r.u]; } }
      });
      var todo = Object.keys(want).filter(function (u) { return !have[u]; }), running = 0;
      (function pump() {
        if (!todo.length && !running) syncing = false;
        while (running < 3 && todo.length) {
          (function (u) {
            running++;
            blobOf(u, function (b) { running--; if (b) { putImg(u, b); keep(u, b); } pump(); });
          })(todo.shift());
        }
      })();
    });
  }
  // A card's picture did not load from the server: show its saved copy, if there is one.
  function fb(img) {
    var u = img.getAttribute("src");
    if (saved[u] && !img.getAttribute("data-fb")) { img.setAttribute("data-fb", "1"); img.src = saved[u]; }
  }
  // The row changed: redraw just the row (app.js tv.shelf), else the whole home.
  function redraw() { var tv = window.tv; if (tv && tv.shelf) tv.shelf(); else if (tv && tv.refresh) tv.refresh(); }
  function setDown(v) { if (v !== down) { down = v; redraw(); } }

  // Continue watching: the current endpoint first, the old one for an older server.
  function resume(cfg, done) {
    var q = "Limit=" + PER + "&MediaTypes=Video&EnableUserData=true&EnableImageTypes=Backdrop,Thumb,Primary&Fields=" + FIELDS;
    get(cfg, "/UserItems/Resume?userId=" + cfg.uid + "&" + q, function (err, j) {
      if (!err) return done(null, j);
      get(cfg, "/Users/" + cfg.uid + "/Items/Resume?" + q, done);
    });
  }

  // Next up: the next episode of each show you are following, one you have not started yet.
  function nextUp(cfg, done) {
    get(cfg, "/Shows/NextUp?UserId=" + cfg.uid + "&Limit=" + PER + "&EnableUserData=true&EnableImageTypes=Backdrop,Thumb,Primary&Fields=" + FIELDS, done);
  }

  // The two rows as one, the way Moonfin's own home does it: what is in progress, then the next episodes
  // (an episode already in progress is not listed twice), newest watched first. A next episode has no play
  // date of its own, so it takes the date its show was last watched; ones with no date go last.
  function combine(resumeItems, nextItems) {
    var seen = {}, lastOf = {};
    resumeItems.forEach(function (it) {
      var d = it.UserData && it.UserData.LastPlayedDate;
      seen[it.Id] = true;
      if (it.SeriesId && d && (!lastOf[it.SeriesId] || d > lastOf[it.SeriesId])) lastOf[it.SeriesId] = d;
    });
    var fresh = nextItems.filter(function (it) { return !seen[it.Id]; });
    fresh.forEach(function (it) { it._next = true; });
    var all = resumeItems.concat(fresh).map(function (it, i) {
      return { it: it, i: i, d: (it.UserData && it.UserData.LastPlayedDate) || lastOf[it.SeriesId] || "" };
    });
    all.sort(function (a, b) { return a.d && b.d ? (a.d < b.d ? 1 : a.d > b.d ? -1 : a.i - b.i) : a.d ? -1 : b.d ? 1 : a.i - b.i; });
    return all.map(function (x) { return x.it; }).slice(0, MAX);
  }

  function refresh(force, done) {
    var cfg = read(CFG);
    if (!cfg || busy || (!force && Date.now() - lastTry < 30000)) { if (done) done(null); return; }
    busy = true; lastTry = Date.now();
    function bad(e) {
      var changed = problem !== e;
      problem = e; busy = false;
      if (e === "net") setDown(true);
      if (changed) redraw();   // the row says why it is empty
      if (done) done(e);
    }
    withUser(cfg, function (err, c) {
      if (err) { bad(err); return; }
      write(CFG, c);
      resume(c, function (err2, j) {
        if (err2) { bad(err2); return; }
        // a server with no Next up (or one that fails) still shows what is in progress
        nextUp(c, function (err3, n) {
          busy = false; problem = "";
          var app = { package: moonId(), name: "Moonfin" };
          var items = combine(j.Items || [], err3 || !n ? [] : n.Items || []);
          var cards = items.map(function (it) { return card(c, it, app); });
          var out = JSON.stringify(cards);
          var changed = out !== localStorage.getItem(ROWS);
          try { localStorage.setItem(ROWS, out); localStorage.setItem(AT, String(Date.now())); } catch (e) {}
          var wasDown = down;
          down = false;
          syncImages(cards.reduce(function (a, k) { return a.concat([k.backdrop, k.poster]); }, []));
          if (changed || wasDown) { lastUpdate = Date.now(); redraw(); }
          if (done) done(null, items.length);
        });
      });
    });
  }

  // What the home asks for each time it reads its lists: last time's rows now, fresh ones soon. With the server
  // off, the row is made from the saved pictures; after three days off it is dropped.
  function watchNext() {
    refresh(false);
    if (stale()) return "[]";
    var rows = read(ROWS) || [];
    if (down) rows.forEach(function (r) { if (saved[r.backdrop]) r.backdrop = saved[r.backdrop]; if (saved[r.poster]) r.poster = saved[r.poster]; });
    return JSON.stringify(rows);
  }

  // A card was opened: Moonfin gets the title the way Samsung's Smart Hub hands one to it.
  function launchOnce(row, app) {
    try {
      var data = [new tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: JSON.stringify(row.jf) })])];
      var ctl = new tizen.ApplicationControl("http://samsung.com/appcontrol/operation/eden_resume", null, null, null, data);
      tizen.application.launchAppControl(ctl, app, function () {}, function () { toast(t("jf_no_moonfin")); });
    } catch (e) { toast(t("jf_no_moonfin")); }
  }
  function open(id) {
    var row = (read(ROWS) || []).filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return false;
    var app = moonId();
    function go() { launchOnce(row, app); }
    try {
      tizen.application.getAppsContext(function (list) {
        var running = (list || []).filter(function (c) { return c.appId === app; })[0];
        if (!running) { go(); return; }
        // Moonfin already open, or in the background, only comes forward and does not read the title. So it is closed and
        // started again with the title (a cold start reads it), and where closing it is not allowed, it is asked twice.
        var once = false;
        function again() { if (once) return; once = true; go(); setTimeout(go, 1800); }
        try {
          tizen.application.kill(running.id, function () { if (once) return; once = true; setTimeout(go, 800); }, again);
        } catch (e) { again(); }
      }, go);
    } catch (e) { go(); }
    return true;
  }

  // The row follows the server: read again every minute while the home is on screen.
  setInterval(function () { if (!document.hidden) refresh(true); }, 60000);
  preload();

  // ---------- how the row looks: a layout and a size, kept on this TV ----------
  // "open": posters, the focused one opens into its backdrop (Moonfin's home). "posters": posters only.
  // "wide": landscape cards. "glass": the original glass cards (app.js draws those itself).
  // Sizes are the card height in rem. n and f are the card's width unfocused and focused, in rem;
  // app.js hands them to tizen.css as --jh, --jn and --jf and uses them to slide the row.
  var LOOK = "couch.jf.look", LAYOUTS = ["open", "posters", "wide", "glass"], SIZES = [8, 10.75, 13.5, 16];
  function look() {
    var v = read(LOOK) || {};
    var layout = LAYOUTS.indexOf(v.layout) >= 0 ? v.layout : "open";
    var size = v.size >= 0 && v.size < SIZES.length ? v.size | 0 : 1;
    var h = SIZES[size], n = (layout === "wide" ? 1.775 : 0.675) * h;
    return { layout: layout, size: size, h: h, n: n, f: layout === "open" ? 1.775 * h : n };
  }

  // A small panel in the corner; the real home, with the real row, stays in view and changes as you pick.
  function openLook(onClose) {
    if (document.getElementById("jf-look")) return;
    var box = document.createElement("div"), sec = document.getElementById("shelf-section"), at = 0;
    box.id = "jf-look";
    if (sec) sec.classList.add("jpeek");   // the first card shows as focused, so the open layout is seen too
    function paint() {
      var l = look();
      box.innerHTML = '<div class="jf-panel"><h2>' + esc(t("jf_look_title")) + '</h2>' +
        [["jf_layout", "jf_lay_" + l.layout], ["jf_size", "jf_size_" + l.size]].map(function (r, i) {
          return '<div class="jf-sel' + (i === at ? " on" : "") + '"><span>' + esc(t(r[0])) + '</span><b>‹ ' + esc(t(r[1])) + ' ›</b></div>';
        }).join("") + '<small>' + esc(t("jf_look_hint")) + '</small></div>';
    }
    function change(d) {
      var v = read(LOOK) || {}, l = look();
      if (at === 0) v.layout = LAYOUTS[(LAYOUTS.indexOf(l.layout) + d + LAYOUTS.length) % LAYOUTS.length];
      else v.size = Math.max(0, Math.min(SIZES.length - 1, l.size + d));
      write(LOOK, v);
      paint();
      redraw();
    }
    function close() {
      document.removeEventListener("keydown", keys, true);
      if (box.parentNode) box.parentNode.removeChild(box);
      if (sec) sec.classList.remove("jpeek");
      if (onClose) onClose();
    }
    function keys(e) {
      var k = e.keyCode;
      if (k === 10009 || k === 27 || k === 13) { e.preventDefault(); close(); }
      else if (k === 38 || k === 40) { e.preventDefault(); at = at === 0 ? 1 : 0; paint(); }
      else if (k === 37 || k === 39) { e.preventDefault(); change(k === 39 ? 1 : -1); }
      e.stopImmediatePropagation();
    }
    document.body.appendChild(box);
    paint();
    document.addEventListener("keydown", keys, true);
  }

  // ---------- the setup screen (the Jellyfin tile): server, API key, user name ----------
  function setup(onClose) {
    if (document.getElementById("jf-setup")) return;
    var cfg = read(CFG) || {};
    var box = document.createElement("div");
    box.id = "jf-setup";
    function field(id, label, value, hint) {
      return '<label>' + esc(label) + '<input id="' + id + '" type="text" value="' + esc(value || "") + '" placeholder="' + esc(hint || "") +
        '" autocomplete="off" autocapitalize="off" spellcheck="false" readonly></label>';
    }
    box.innerHTML = '<div class="jf-panel"><h2>' + esc(t("jf_title")) + '</h2><p>' + esc(t("jf_note")) + '</p>' +
      field("jf-server", t("jf_server"), cfg.server, "http://your-server:8096") +
      field("jf-key", t("jf_key"), cfg.key, "") +
      field("jf-user", t("jf_user"), cfg.user, "") +
      '<div class="jf-row"><button id="jf-save" type="button">' + esc(t("jf_save")) + '</button>' +
      '<button id="jf-forget" type="button">' + esc(t("jf_forget")) + '</button></div>' +
      '<div id="jf-msg"></div><small>' + esc(t("jf_hint")) + '</small></div>';
    document.body.appendChild(box);
    var els = ["jf-server", "jf-key", "jf-user", "jf-save", "jf-forget"].map(function (i) { return document.getElementById(i); });
    function say(s) { document.getElementById("jf-msg").textContent = s; }
    function close() {
      document.removeEventListener("keydown", keys, true);
      if (box.parentNode) box.parentNode.removeChild(box);
      if (onClose) onClose();
    }
    function save() {
      var c = { server: normalize(els[0].value), key: els[1].value.trim(), user: els[2].value.trim() };
      if (!c.server || !c.key) { say(t("jf_need")); return; }
      say(t("jf_connecting"));
      withUser(c, function (err, ok) {
        if (err) { say(t(err === "key" ? "jf_err_key" : err === "user" ? "jf_err_user" : err === "http" ? "jf_err_http" : "jf_err_net")); return; }
        write(CFG, ok);
        busy = false;
        refresh(true, function (e2, n) {
          say(e2 ? t("jf_err_net") : t("jf_ok", { n: n || 0 }));
          if (!e2 && window.tv && window.tv.keepWatching) window.tv.keepWatching(true);
          if (!e2) setTimeout(close, 1800);
        });
      });
    }
    function forget() { write(CFG, null); write(ROWS, null); try { localStorage.removeItem(AT); } catch (e) {} clearImgs(); saved = {}; redraw(); close(); }
    // A box is read-only until OK is pressed on it, so moving over it does not raise the TV's keyboard.
    // Pressing OK makes it editable and the keyboard opens; its Done (or Back) puts it back.
    var editing = null, reopening = false;
    function edit(el) {
      editing = el; reopening = true;
      el.readOnly = false;
      el.blur(); el.focus();   // a fresh focus on an editable box is what brings the keyboard up
      reopening = false;
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
    }
    function finish() {
      var el = editing;
      if (!el) return;
      editing = null; reopening = true;
      el.readOnly = true;
      el.blur(); el.focus();
      reopening = false;
    }
    for (var n = 0; n < 3; n++) els[n].addEventListener("blur", function () { if (editing === this && !reopening) finish(); });
    // Runs before the home's own keys: the home must not move behind this screen. Typing keys are left
    // alone (Samsung says not to stop them); 65376 and 65385 are the keyboard's Done and Cancel.
    function keys(e) {
      var i = els.indexOf(document.activeElement), k = e.keyCode;
      if (editing) {
        if (k === 13 || k === 65376 || k === 65385 || k === 10009 || k === 27) { finish(); if (k !== 13 && k !== 65376) e.preventDefault(); }
        else if (k === 38 || k === 40) { finish(); e.preventDefault(); els[Math.max(0, Math.min(els.length - 1, i + (k === 40 ? 1 : -1)))].focus(); }
        e.stopImmediatePropagation();
        return;
      }
      if (k === 10009 || k === 27) { e.preventDefault(); close(); }
      else if (k === 38 || k === 40) { e.preventDefault(); els[Math.max(0, Math.min(els.length - 1, (i < 0 ? 0 : i) + (k === 40 ? 1 : -1)))].focus(); }
      else if ((k === 37 || k === 39) && i >= 3) { e.preventDefault(); els[i === 3 ? 4 : 3].focus(); }   // Save and Forget sit side by side
      else if (k === 13 && i >= 0 && i < 3) { e.preventDefault(); edit(els[i]); }
      else if (k === 13 && i === 3) { e.preventDefault(); save(); }
      else if (k === 13 && i === 4) { e.preventDefault(); forget(); }
      e.stopImmediatePropagation();
    }
    document.addEventListener("keydown", keys, true);
    els[3].addEventListener("click", save);
    els[4].addEventListener("click", forget);
    els[0].focus();
  }

  // Home settings (app.js) has a Jellyfin section: it opens these two screens and shows the server.
  window.MoonfinTV = { watchNext: watchNext, open: open, setup: setup, openLook: openLook, look: look,
    server: function () { var c = read(CFG); return c && c.server ? c.server : ""; },
    count: function () { return stale() ? 0 : (read(ROWS) || []).length; },
    problem: function () { return problem ? t(problem === "key" ? "jf_err_key" : problem === "user" ? "jf_err_user" : problem === "http" ? "jf_err_http" : "jf_err_net") : ""; }, fb: fb, updated: function () { return lastUpdate; },
    refresh: function (force) { refresh(force); } };
})();
