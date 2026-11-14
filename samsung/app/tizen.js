// The Samsung side of the TV home. On Android the launcher app gives the page window.TVOS (the
// apps on the TV, open an app, a place to keep things); on a Samsung this file does the same job
// with Tizen's own calls, so tv-home/web/app.js runs unchanged.
//
// Apps keep their Android names inside the page (Netflix is "com.netflix.ninja"), so the order
// arranged on the phone works on every TV. COUCH_TIZEN_APPS (tizen-apps.js, made by build.py from
// bridge/apps.py) says which Samsung app each one is.
(function () {
  "use strict";
  var S = window.COUCH_TIZEN || {};
  var MAP = window.COUCH_TIZEN_APPS || {};
  var SELF = "CouchTVApp.Home";
  var BRIDGE = ((location.search.match(/[?&]api=([^&]+)/) || [])[1] || "");
  BRIDGE = decodeURIComponent(BRIDGE);
  var TV_ID = (location.search.match(/[?&]tv=([a-z0-9-]+)/) || [])[1] || "";

  // ---------- optional debug log (build.py --log-url), for testing without a screenshot ----------
  var LOG = S.log || "";
  function send(kind, data) {
    if (!LOG) return;
    try {
      var x = new XMLHttpRequest();
      x.open("POST", LOG + "/" + kind);
      x.setRequestHeader("Content-Type", "text/plain");
      x.send(typeof data === "string" ? data : JSON.stringify(data));
    } catch (e) {}
  }
  if (LOG) {
    window.addEventListener("error", function (e) { send("log", "error: " + e.message + " at " + e.filename + ":" + e.lineno); });
    ["log", "warn", "error"].forEach(function (k) {
      var orig = console[k];
      console[k] = function () {
        send("log", k + ": " + Array.prototype.slice.call(arguments).join(" "));
        if (orig) orig.apply(console, arguments);
      };
    });
    window.addEventListener("load", function () {
      setTimeout(function () {
        send("dom", "<!-- " + location.href + " -->\n" + document.documentElement.outerHTML);
      }, 9000);
    });
    document.addEventListener("keydown", function (e) { send("log", "key " + e.keyCode + " " + e.key); }, true);
  }

  // ---------- the apps on this TV ----------
  var tizenApps = [];
  try { tizenApps = JSON.parse(localStorage.getItem("couch.tizen.apps") || "[]"); } catch (e) {}
  var byTizen = {};   // Tizen id or package id -> Android-style package
  Object.keys(MAP).forEach(function (pkg) {
    var m = MAP[pkg];
    (m.ids || []).forEach(function (id) { byTizen[id] = pkg; });
    if (m.app) byTizen[m.app] = pkg;
  });
  // Tizen lists hundreds of system parts as apps (a 2021 TV: 437). Apps from Samsung's store have a
  // 10 character package id (Tubi is 3KA0pm7a7V); system ones are org.tizen.* or com.samsung.*.
  // A few store-installed extras are Samsung's own and stay hidden.
  var STORE = /^[A-Za-z0-9]{10}$/;
  var HIDE = /^(e-Manual|Security Center|Samsung Promotion|Smarthub Connection Test)$/i;
  var byPkg = {}, shown = [];
  function sortOut() {
    byPkg = {}; shown = [];
    tizenApps.forEach(function (a) {
      if (a.id === SELF || a.packageId === SELF.split(".")[0]) return;
      var pkg = byTizen[a.id] || byTizen[a.packageId];
      if (pkg && !byPkg[pkg]) {
        byPkg[pkg] = a;
        shown.push({ package: pkg, label: MAP[pkg].name || a.name });
      } else if (!pkg && a.show && (STORE.test(a.packageId || "") || /^moonfin$/i.test(a.name || "")) && !HIDE.test(a.name || "") && !byPkg[a.id]) {
        // Moonfin is sideloaded, so its id is not a store one; it is shown by name
        byPkg[a.id] = a;
        shown.push({ package: a.id, label: a.name });
      }
    });
    if (SKY_PORT) shown.unshift({ package: SKY, label: "Sky" });
    shown.unshift({ package: WX, label: "Weather" });
    shown.unshift({ package: LIVE, label: "TV" });
    var sa = storeApp();   // Samsung's Apps: an app like the others (listed by the TV, opened with the id the TV lists), after TV and Weather
    if (sa && !byPkg[sa.id]) byPkg[sa.id] = sa;
    shown.splice(2, 0, { package: storePkg(), label: sa && sa.name ? sa.name : "Apps" });
  }
  // Samsung's own Apps (its store). Free My TV lists it like any other Samsung app and opens it with the id the TV gives it (it keeps
  // com.samsung.tv.store out of its hidden system apps), so this does the same: that id, found in the TV's list by id or by its name, and
  // opened by the one launch every other app uses. No guessed ids (they made the TV open YouTube).
  var STORE_ID = "com.samsung.tv.store", STORE_NAME = /^(apps|aplica[țtţ]ii|anwendungen|applications|aplicaciones|applicazioni|toepassingen|aplikacje|uygulamalar|приложения)$/i;
  function storeApp() {
    var list = tizenApps.filter(function (a) { return a.id !== SELF && !STORE.test(a.packageId || ""); });
    return list.filter(function (a) { return a.id === STORE_ID; })[0] ||
      list.filter(function (a) { return STORE_NAME.test(String(a.name || "").trim()) && /^(com\.samsung|org\.tizen)\./.test(a.id || ""); })[0] || null;
  }
  function storePkg() { var a = storeApp(); return a ? a.id : STORE_ID; }
  var SKY = "local.sky", LIVE = "local.tv", WX = "local.weather", SKY_PORT = parseInt(S.sky_hdmi, 10) || 0, skyOn = false;
  function t(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }
  sortOut();
  send("log", "apps on this TV: " + tizenApps.length + ", shown: " + shown.map(function (a) { return a.label; }).join(", "));

  // The list in localStorage is last time's. Read it again a few seconds after the home is up (a TV
  // with hundreds of apps takes several seconds to answer), save it, and reload the home only if the
  // apps shown have changed (#53).
  setTimeout(function () {
    try {
      tizen.application.getAppsInfo(function (list) {
        var fresh = list.map(function (a) {
          return { id: a.id, name: a.name, packageId: a.packageId, iconPath: a.iconPath, show: a.show };
        });
        var before = shown.map(function (a) { return a.package; }).join("|");
        try { localStorage.setItem("couch.tizen.apps", JSON.stringify(fresh)); } catch (e) {}
        tizenApps = fresh;
        sortOut();
        if (shown.map(function (a) { return a.package; }).join("|") !== before) {
          send("log", "app list changed, reloading");
          location.reload();
        }
      }, function () {});
    } catch (e) {}
  }, tizenApps.length ? 9000 : 100);   // the first ever start has no list yet, so it asks at once

  // ---------- a Sky box on an HDMI input ("sky_hdmi" in this TV's entry in config.json) ----------
  // tvwindow shows the input full screen in front of this app. The Sky remote talks to the box, so
  // it keeps working; Back on the Samsung remote closes the window and returns to the home.
  // With no "sky_hdmi", this TV has no Sky tile.
  function skyNote(text) {
    send("log", "sky: " + text);
    var n = document.getElementById("sky-note");
    if (!n) {
      n = document.createElement("div");
      n.id = "sky-note";
      n.style.cssText = "position:fixed;left:48px;bottom:48px;z-index:99999;max-width:1400px;padding:20px 28px;" +
        "border-radius:12px;background:#111;color:#fff;font:28px sans-serif";
      document.body.appendChild(n);
    }
    n.textContent = text;
    clearTimeout(skyNote.t);
    skyNote.t = setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 15000);
  }

  function errText(e) { return (e && e.name ? e.name + ": " : "") + ((e && e.message) || String(e)); }

  function closeSky() {
    skyOn = false;
    try { tizen.tvwindow.hide(function () {}, function (e) { skyNote("Sky did not close. " + errText(e)); }); }
    catch (e) { skyNote("Sky did not close. " + errText(e)); }
  }

  // Any input or live TV, the same way: the picked source full screen in front of this app.
  // tvwindow only takes one of the TV's own source objects (a plain {type, number} is refused: "cannot convert
  // Object to SystemInfoVideoSourceInfo"), and a 2021 Q67A listed just "TV 1" as connected while a PS5 was on
  // HDMI 2. So the connected list is searched first and then the supported one, which names every port.
  // The way Free My TV does it (its Tizen build works on a 2021 set): the sources are the connected ones AND the disconnected
  // ones (a device on standby is "disconnected" and tvwindow still switches to it, as Samsung's own source menu does), and
  // after setSource the TV's own viewer app is launched to show it.
  var VIEWER = "org.tizen.tv-viewer";
  function showSource(type, number, label) {
    var listed = "";
    function failed(step, e) {
      skyOn = false;
      skyNote(label + " " + t("src_failed") + " (" + step + "). " + errText(e) + (listed ? " " + t("src_lists") + " " + listed : ""));
    }
    function inFront() {   // the viewer would not open: this app's own window, as before
      try {
        tizen.tvwindow.show(function () { skyOn = true; }, function (e) { failed("show", e); }, ["0", "0", "100%", "100%"], "MAIN", "FRONT");
      } catch (e) { failed("show", e); }
    }
    function go(src) {
      try {
        tizen.tvwindow.setSource(src, function () {
          try { tizen.application.launch(VIEWER, function () { skyOn = false; }, inFront); } catch (e) { inFront(); }
        }, function (e) { failed("setSource", e); });
      } catch (e) { failed("setSource", e); }
    }
    function names(a) { return (a || []).map(function (s) { return s.type + " " + s.number; }).join(", ") || "-"; }
    try {
      tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
        var conn = (info && info.connected) || [], off = (info && info.disconnected) || [], supp = (info && info.supported) || [], src = null;
        listed = names(conn) + " | " + names(off) + " | " + names(supp);
        conn.concat(off, supp).forEach(function (s) { if (!src && s.type === type && (type === "TV" || s.number === number)) src = s; });
        if (src) go(src); else failed(t("src_not_connected"), "");
      }, function (e) { failed("list inputs", e); });
    } catch (e) { failed("start", e); }
    return true;
  }

  function openSky() { return showSource("HDMI", SKY_PORT, "Sky"); }

  // ---------- the Input button: live TV and the HDMI ports, shown by the TV window ----------
  // Ids are "tv" or "<type>:<port>" ("HDMI:2"). HDMI 1 to 4 are always listed; further ports and the
  // other inputs (AV, component) appear once the TV says they are connected. A port with nothing
  // plugged in says so when it is picked.
  var INPUTS_KEY = "couch.tizen.inputs", extra = [];
  try { extra = JSON.parse(localStorage.getItem(INPUTS_KEY) || "[]"); } catch (e) {}
  try {
    tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
      extra = ((info && info.connected) || []).filter(   // only what is plugged in; the supported list (every port) is only for opening one
        function (s, i, all) {
        return s.type !== "TV" && !(s.type === "HDMI" && s.number <= 4) && all.findIndex(function (o) { return o.type === s.type && o.number === s.number; }) === i;
      }).map(function (s) { return { type: s.type, number: s.number }; });
      try { localStorage.setItem(INPUTS_KEY, JSON.stringify(extra)); } catch (e) {}
    }, function () {});
  } catch (e) {}

  function tvInputs() {
    var list = [{ id: "tv", label: t("tv_live"), type: "tv", icon: "tv", devices: [] }];
    for (var n = 1; n <= 4; n++) list.push({ id: "HDMI:" + n, label: "HDMI " + n, type: "hdmi", icon: "hdmi", devices: [] });
    extra.forEach(function (s) {
      list.push({ id: s.type + ":" + s.number, label: s.type + " " + s.number, type: s.type === "HDMI" ? "hdmi" : "input",
        icon: s.type === "HDMI" ? "hdmi" : "input", devices: [] });
    });
    return JSON.stringify(list);
  }

  function openInput(id) {
    var p = String(id).split(":"), live = p[0] === "tv";
    return live ? showSource("TV", 0, t("tv_live")) : showSource(p[0], parseInt(p[1], 10), p[0] + " " + p[1]);
  }

  // ---------- "TV settings" in the gear menu ----------
  // Tizen gives a web app no call for the TV's own settings, so this looks for the Settings app in this
  // TV's apps list (by its name or its id) and tries each, the visible ones first; if none opens it says so.
  var SETTINGS_NAME = /^(settings?|setări|setari|einstellungen|paramètres|réglages|impostazioni|ajustes|configuración|ayarlar|instellingen)$/i;
  function openTvSettings() {
    // Free My TV's Tizen build opens it with the platform's "setting" app control and falls back to the TV's menu app, and on this
    // kind of TV that took 20 seconds. So the menu app goes first, then the app control, then this TV's apps list by name or id,
    // each only when the one before said it could not (never several at once: they would all open on top of each other).
    var found = tizenApps.filter(function (a) {
      return a.id !== SELF && (SETTINGS_NAME.test(String(a.name || "").trim()) || /(^|[.\-_])settings?([.\-_]|$)/i.test(a.id || ""));
    }).sort(function (a, b) { return (b.show !== false) - (a.show !== false); }).map(function (a) { return a.id; });
    var tries = ["org.tizen.menu", "control"].concat(found);
    ["org.tizen.settings-tv-ref", "org.tizen.tv-settings", "org.tizen.setting"].forEach(function (g) { if (tries.indexOf(g) < 0) tries.push(g); });
    var opened = false;
    (function attempt(i) {
      if (opened) return;
      if (i >= tries.length) { skyNote(t("tv_settings_none") + (found.length ? " (" + found.slice(0, 3).join(", ") + ")" : "")); return; }
      var moved = false;
      function next() { if (!moved) { moved = true; attempt(i + 1); } }
      function done() { opened = true; send("log", "settings: opened by " + tries[i]); }
      try {
        if (tries[i] === "control") {
          var ctl = new tizen.ApplicationControl("http://tizen.org/appcontrol/operation/setting", null, null, null, []);
          tizen.application.launchAppControl(ctl, null, done, next);
        } else tizen.application.launch(tries[i], done, next);
      } catch (e) { next(); }
    })(0);
    return true;
  }

  // Runs before app.js's own keys: with Sky on screen, the home must not move behind it.
  document.addEventListener("keydown", function (e) {
    if (!skyOn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.keyCode === 10009) closeSky();
  }, true);
  document.addEventListener("visibilitychange", function () { if (document.hidden && skyOn) closeSky(); });

  function bridgeLaunch(pkg) {
    if (!BRIDGE) return;
    var x = new XMLHttpRequest();
    x.open("POST", BRIDGE + "/api/launch");
    x.setRequestHeader("Content-Type", "application/json");
    if (S.key) x.setRequestHeader("Authorization", "Bearer " + S.key);
    x.send(JSON.stringify(TV_ID ? { app: pkg, tv: TV_ID } : { app: pkg }));
  }

  function launch(pkg) {
    if (pkg === SKY) return openSky();
    if (pkg === LIVE) return openInput("tv");
    if (pkg === WX) { if (window.WeatherTV) window.WeatherTV.open(); return true; }
    if (pkg === "com.android.tv.settings") return openTvSettings();   // the gear menu's "TV settings"
    var a = byPkg[pkg], m = MAP[pkg];
    var ids = a ? [a.id] : [];
    if (m) (m.ids || []).concat(m.app ? [m.app] : []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    if (!ids.length && /\./.test(pkg)) ids.push(pkg);
    if (!ids.length) return false;
    // Some TVs list a "-dummy" placeholder for an app (Prime Video). It opens nothing, so try it last.
    ids = ids.filter(function (id) { return !/-dummy$/.test(id); })
      .concat(ids.filter(function (id) { return /-dummy$/.test(id); }));
    (function attempt(i) {
      if (i >= ids.length) { send("log", "launch failed for " + pkg + ", asking the bridge"); bridgeLaunch(pkg); return; }
      try {
        tizen.application.launch(ids[i], function () { send("log", "launched " + ids[i]); },
          function (err) { send("log", "launch " + ids[i] + ": " + (err && err.name)); attempt(i + 1); });
      } catch (e) { send("log", "launch " + ids[i] + " threw " + e); attempt(i + 1); }
    })(0);
    return true;
  }

  // The TV and Jellyfin tiles have no app logo: a glass-coloured square with a line icon.
  function tileIcon(shape, bg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect width="24" height="24" rx="5" fill="' + bg + '"/><g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" ' +
      'stroke-linejoin="round" transform="translate(4 4) scale(.667)">' + shape + "</g></svg>");
  }

  function iconUrl(pkg) {
    if (pkg === SKY) return "logo-sky.png";
    if (pkg === WX) return tileIcon('<circle cx="9" cy="9" r="3.4"/><path d="M9 2.5v1.6M9 13.9v1.6M2.5 9h1.6M15 9h1.6M4.4 4.4l1.1 1.1M12.5 12.5l1.1 1.1M13.6 4.4l-1.1 1.1M5.5 12.5l-1.1 1.1"/><path d="M9.5 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.4-1.2A4.1 4.1 0 0 0 9.5 20z"/>', "#2d7ff9");
    if (pkg === LIVE) return tileIcon('<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M8 22h8M8.5 2.5L12 6l3.5-3.5"/>', "#0a84ff");
    var m = MAP[pkg];
    if (m && m.logo) return "logos/" + pkg + ".png";
    var a = byPkg[pkg];
    if (a && a.iconPath) return /^[a-z]+:/.test(a.iconPath) ? a.iconPath : "file://" + a.iconPath;
    return null;
  }

  // The splash (build.py puts it first in index.html) covers the page until the home has drawn its clock and
  // photo (app.js adds home-ready), so there is a spinner, not a black screen and a lone "Keep watching", while
  // the page loads or reloads. The dock and the row fill in over the home, not behind a spinner.
  (function () {
    var splash = document.getElementById("splash"), t0 = Date.now();
    if (!splash) return;
    (function wait() {
      if (!document.documentElement.classList.contains("home-ready") && Date.now() - t0 < 6000) { setTimeout(wait, 40); return; }
      splash.className = "out";
      setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 320);
    })();
  })();

  window.TVOS = {
    // the TV tile's name is said in the language chosen, which is set after this file loads
    apps: function () {
      return JSON.stringify(shown.map(function (a) {
        return a.package === LIVE ? { package: LIVE, label: t("tv_live") } : a.package === WX ? { package: WX, label: t("sec_weather") } : a;
      }));
    },
    launch: launch,
    iconUrl: iconUrl,
    version: function () { return S.version || ""; },   // Home settings > About
    storeApp: function () { var a = storeApp(); return JSON.stringify({ package: storePkg(), label: a ? a.name : "" }); },
    bannerUrl: function () { return null; },
    kept: function (k) { try { return localStorage.getItem("tvos." + k); } catch (e) { return null; } },
    keep: function (k, v) { try { localStorage.setItem("tvos." + k, v); } catch (e) {} },
    // the Input button: the TV's own window shows the picked source (no bridge, no Source key)
    canOpenInputs: function () { return true; },
    openInputs: function () { return false; },
    tvInputs: tvInputs,
    openInput: openInput,
    // Keep watching from the Jellyfin server typed in on the TV, opened in Moonfin (moonfin.js)
    watchNext: window.MoonfinTV.watchNext,
    openWatchNext: window.MoonfinTV.open,
    toast: skyNote
  };

  // ---------- the remote ----------
  // Arrows, OK (Enter) and Back (10009) reach the page by themselves. Tools (the remote's menu key)
  // has to be asked for: it picks an app up, like holding OK.
  var TOOLS = null;
  try {
    tizen.tvinputdevice.registerKey("Tools");
    TOOLS = tizen.tvinputdevice.getKey("Tools").code;
  } catch (e) {}
  document.addEventListener("keydown", function (e) {
    if (TOOLS !== null && e.keyCode === TOOLS) {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
    }
  }, true);

  // ---------- jobs only an app on the TV may do (bridge/samsung.py open_title) ----------
  // The bridge cannot open a title in Prime, Stan and the rest itself: a Samsung app passes the
  // title on with launchAppControl (operation eden_resume, PAYLOAD {"values": <JustWatch's
  // action_data>}). This asks the bridge for jobs while couch-tv is on screen.
  var polling = false;
  function answer(id, ok, error) {
    try {
      var x = new XMLHttpRequest();
      x.open("POST", BRIDGE + "/api/tizen/answer");
      x.setRequestHeader("Content-Type", "application/json");
      if (S.key) x.setRequestHeader("Authorization", "Bearer " + S.key);
      x.send(JSON.stringify({ tv: TV_ID || undefined, id: id, ok: ok, error: error || null }));
    } catch (e) {}
  }
  function run(job) {
    send("log", "job " + JSON.stringify(job));
    if (job.do !== "appcontrol") { answer(job.id, false, "unknown job " + job.do); return; }
    try {
      var data = [new tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: job.data })])];
      var ctl = new tizen.ApplicationControl("http://samsung.com/appcontrol/operation/eden_resume", null, null, null, data);
      tizen.application.launchAppControl(ctl, job.app,
        function () { answer(job.id, true); },
        function (e) { answer(job.id, false, (e && e.name) + ": " + (e && e.message)); });
    } catch (e) { answer(job.id, false, String(e)); }
  }
  function jobs() {
    if (!BRIDGE || document.hidden) { polling = false; return; }
    polling = true;
    var x = new XMLHttpRequest();
    x.open("GET", BRIDGE + "/api/tizen/next" + (TV_ID ? "?tv=" + TV_ID : ""));
    if (S.key) x.setRequestHeader("Authorization", "Bearer " + S.key);
    x.timeout = 35000;
    x.onload = function () {
      var job = null;
      try { job = JSON.parse(x.responseText).job; } catch (e) {}
      if (job) run(job);
      setTimeout(jobs, 50);
    };
    x.onerror = x.ontimeout = function () { setTimeout(jobs, 3000); };
    x.send();
  }
  jobs();

  // coming back to the app (after Netflix, say): read the lists again
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && window.MoonfinTV) setTimeout(function () { window.MoonfinTV.refresh(true); }, 1500);   // progress moved while Moonfin was open
    if (!document.hidden && window.tv && window.tv.resume) window.tv.resume();
    if (!document.hidden && !polling) jobs();
  });
})();
