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
    shown.unshift({ package: LIVE, label: "TV" });
  }
  var SKY = "local.sky", LIVE = "local.tv", SKY_PORT = parseInt(S.sky_hdmi, 10) || 0, skyOn = false;
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
  }, 4000);

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
  function showSource(match, label) {
    function failed(step, e) { skyOn = false; skyNote(label + " " + t("src_failed") + " (" + step + "). " + errText(e)); }
    try {
      tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
        var list = (info && info.connected) || [], src = null;
        list.forEach(function (s) { if (!src && match(s)) src = s; });
        if (!src) {
          failed(t("src_not_connected"), t("src_lists") + " " +
            (list.map(function (s) { return s.type + " " + s.number; }).join(", ") || "-"));
          return;
        }
        tizen.tvwindow.setSource(src, function () {
          try {
            tizen.tvwindow.show(function () { skyOn = true; }, function (e) { failed("show", e); },
              ["0", "0", "100%", "100%"], "MAIN", "FRONT");
          } catch (e) { failed("show", e); }
        }, function (e) { failed("setSource", e); });
      }, function (e) { failed("list inputs", e); });
    } catch (e) { failed("start", e); }
    return true;
  }

  function openSky() {
    return showSource(function (s) { return s.type === "HDMI" && s.number === SKY_PORT; }, "Sky");
  }

  // ---------- the Input button: live TV and the HDMI ports, shown by the TV window ----------
  // Ids are "tv" or "<type>:<port>" ("HDMI:2"). HDMI 1 to 4 are always listed; further ports and the
  // other inputs (AV, component) appear once the TV says they are connected. A port with nothing
  // plugged in says so when it is picked.
  var INPUTS_KEY = "couch.tizen.inputs", extra = [];
  try { extra = JSON.parse(localStorage.getItem(INPUTS_KEY) || "[]"); } catch (e) {}
  try {
    tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
      extra = ((info && info.connected) || []).filter(function (s) {
        return s.type !== "TV" && !(s.type === "HDMI" && s.number <= 4);
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
    var p = String(id).split(":"), live = p[0] === "tv", num = parseInt(p[1], 10);
    return showSource(function (s) { return live ? s.type === "TV" : s.type === p[0] && s.number === num; },
      live ? t("tv_live") : p[0] + " " + num);
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
    if (pkg === LIVE) return tileIcon('<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M8 22h8M8.5 2.5L12 6l3.5-3.5"/>', "#0a84ff");
    var m = MAP[pkg];
    if (m && m.logo) return "logos/" + pkg + ".png";
    var a = byPkg[pkg];
    if (a && a.iconPath) return /^[a-z]+:/.test(a.iconPath) ? a.iconPath : "file://" + a.iconPath;
    return null;
  }

  window.TVOS = {
    // the TV tile's name is said in the language chosen, which is set after this file loads
    apps: function () {
      return JSON.stringify(shown.map(function (a) { return a.package === LIVE ? { package: LIVE, label: t("tv_live") } : a; }));
    },
    launch: launch,
    iconUrl: iconUrl,
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
    if (!document.hidden && window.MoonfinTV) window.MoonfinTV.refresh(true);   // progress moved while Moonfin was open
    if (!document.hidden && window.tv && window.tv.resume) window.tv.resume();
    if (!document.hidden && !polling) jobs();
  });
})();
