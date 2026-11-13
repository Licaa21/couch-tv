// Keep watching from your own Jellyfin server, opened in the Moonfin app on this TV. No computer.
// Nothing is baked into the app: the server address, API key and user name are typed on the TV
// (the Jellyfin tile) and kept in this app's own storage on the TV. Loads before tizen.js, which
// hands the home its rows (TVOS.watchNext) and opens a card (TVOS.openWatchNext) through this.
(function () {
  "use strict";
  var CFG = "couch.jf", ROWS = "couch.jf.rows", MOON = "MoonfinApp.moonfin", MAX = 10;
  var busy = false, lastTry = 0;

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

  function image(cfg, it) {
    var id = it.Id, type, tag;
    if (it.BackdropImageTags && it.BackdropImageTags[0]) { type = "Backdrop"; tag = it.BackdropImageTags[0]; }
    else if (it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]) { id = it.ParentBackdropItemId; type = "Backdrop"; tag = it.ParentBackdropImageTags[0]; }
    else if (it.ImageTags && it.ImageTags.Thumb) { type = "Thumb"; tag = it.ImageTags.Thumb; }
    else if (it.ImageTags && it.ImageTags.Primary) { type = "Primary"; tag = it.ImageTags.Primary; }
    else return null;
    return cfg.server + "/Items/" + id + "/Images/" + type + "?fillWidth=640&quality=80&tag=" + tag;
  }

  // The tall cover: a film's own, a show's for its episodes. Cards show it until they are focused.
  function poster(cfg, it) {
    var id = it.Id, tag;
    if (it.Type === "Episode") { id = it.SeriesId; tag = it.SeriesPrimaryImageTag; }
    else tag = it.ImageTags && it.ImageTags.Primary;
    return tag && id ? cfg.server + "/Items/" + id + "/Images/Primary?fillHeight=320&quality=85&tag=" + tag : null;
  }

  // One Jellyfin item as a Keep watching card. "jf" is what Moonfin's own Smart Hub tiles carry.
  function card(cfg, it, app) {
    var ep = it.Type === "Episode";
    var jf = { serverid: it.ServerId, id: it.Id, type: ep ? "episode" : "movie" };
    if (ep) { jf.seasonid = it.SeasonId; jf.seriesid = it.SeriesId; }
    return {
      id: it.Id, wn: true, app: app, jf: jf,
      title: ep ? (it.SeriesName || it.Name) : it.Name,
      episode_title: ep ? it.Name : null,
      season: ep ? it.ParentIndexNumber : null, episode: ep ? it.IndexNumber : null,
      progress: it.UserData && it.UserData.PlayedPercentage ? it.UserData.PlayedPercentage / 100 : 0,
      backdrop: image(cfg, it), poster: poster(cfg, it)
    };
  }

  // The current endpoint first, the old one for an older server.
  function resume(cfg, done) {
    var q = "Limit=" + MAX + "&MediaTypes=Video&EnableUserData=true&EnableImageTypes=Backdrop,Thumb,Primary";
    get(cfg, "/UserItems/Resume?userId=" + cfg.uid + "&" + q, function (err, j) {
      if (!err) return done(null, j);
      get(cfg, "/Users/" + cfg.uid + "/Items/Resume?" + q, done);
    });
  }

  function refresh(force, done) {
    var cfg = read(CFG);
    if (!cfg || busy || (!force && Date.now() - lastTry < 30000)) { if (done) done(null); return; }
    busy = true; lastTry = Date.now();
    withUser(cfg, function (err, c) {
      if (err) { busy = false; if (done) done(err); return; }
      write(CFG, c);
      resume(c, function (err2, j) {
        busy = false;
        if (err2) { if (done) done(err2); return; }
        var app = { package: moonId(), name: "Moonfin" };
        var out = JSON.stringify((j.Items || []).slice(0, MAX).map(function (it) { return card(c, it, app); }));
        var changed = out !== localStorage.getItem(ROWS);
        try { localStorage.setItem(ROWS, out); } catch (e) {}
        if (changed && window.tv && window.tv.refresh) window.tv.refresh();
        if (done) done(null, JSON.parse(out).length);
      });
    });
  }

  // What the home asks for each time it reads its lists: last time's rows now, fresh ones soon.
  function watchNext() {
    refresh(false);
    return JSON.stringify(read(ROWS) || []);
  }

  // A card was opened: Moonfin gets the title the way Samsung's Smart Hub hands one to it.
  function open(id) {
    var row = (read(ROWS) || []).filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row) return false;
    try {
      var data = [new tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: JSON.stringify(row.jf) })])];
      var ctl = new tizen.ApplicationControl("http://samsung.com/appcontrol/operation/eden_resume", null, null, null, data);
      tizen.application.launchAppControl(ctl, moonId(), function () {}, function () { toast(t("jf_no_moonfin")); });
      return true;
    } catch (e) { toast(t("jf_no_moonfin")); return false; }
  }

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
  function redraw() { if (window.tv && window.tv.refresh) window.tv.refresh(); }

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
        '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>';
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
        if (err) { say(t(err === "key" ? "jf_err_key" : err === "user" ? "jf_err_user" : "jf_err_net")); return; }
        write(CFG, ok);
        busy = false;
        refresh(true, function (e2, n) {
          say(e2 ? t("jf_err_net") : t("jf_ok", { n: n || 0 }));
          if (!e2) setTimeout(close, 1800);
        });
      });
    }
    function forget() { write(CFG, null); write(ROWS, null); if (window.tv && window.tv.refresh) window.tv.refresh(); close(); }
    // Runs before the home's own keys: the home must not move behind this screen.
    function keys(e) {
      var i = els.indexOf(document.activeElement), k = e.keyCode;
      if (k === 10009 || k === 27) { e.preventDefault(); close(); }
      else if (k === 38 || k === 40) { e.preventDefault(); els[Math.max(0, Math.min(els.length - 1, (i < 0 ? 0 : i) + (k === 40 ? 1 : -1)))].focus(); }
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
    refresh: function (force) { refresh(force); } };
})();
