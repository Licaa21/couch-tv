// The widgets page below the dock. Down from the dock scrolls the home up and a second page rises in its place:
// a weather card, live TV and the HDMI inputs, shortcuts (Home settings, TV settings, Moonfin) and an Apps
// button that opens every app on the TV, A to Z. Up or Back scrolls back. A small arrow under the dock says
// the page is there (app.js shows it only while Down would open it).
(function () {
  "use strict";
  var root = document.documentElement;
  var el = null, isOpen = false, busy = false, rows = [], ri = 0, ci = 1, popup = null, pop = { tiles: [], i: 0 };

  function t(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var ICON = {
    tv: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M8 22h8M8.5 2.5L12 6l3.5-3.5"/>',
    hdmi: '<path d="M4 8h16v5l-3 4H7l-3-4z"/><path d="M8 8v3M11 8v3M13 8v3M16 8v3"/>',
    apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    home: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/>',
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + "</svg>"; }
  function card(k, icon, label) { return '<div class="cp-card cp-btn" data-k="' + k + '"><i>' + svg(icon) + "</i><b>" + esc(label) + "</b></div>"; }


  function build() {
    el = document.createElement("div");
    el.id = "cp";
    el.innerHTML = '<div class="cp-grid">' +
      '<div class="cp-card cp-wx" data-k="wx"><div class="cp-wxbody">' + esc(t("wx_loading")) + "</div></div>" +
      '<div class="cp-sec"><h3>' + esc(t("cp_inputs")) + '</h3><div class="cp-row">' +
        card("tv", "tv", t("tv_live")) + [1, 2, 3, 4].map(function (n) { return card("h" + n, "hdmi", "HDMI " + n); }).join("") + "</div></div>" +
      '<div class="cp-sec"><h3>' + esc(t("cp_shortcuts")) + '</h3><div class="cp-row">' +
        card("apps", "apps", t("apps")) + card("hs", "home", t("gear_home")) + card("tvs", "gear", t("gear_tv")) + "</div></div>" +
      '</div><small class="cp-hint">' + esc(t("cp_hint")) + "</small>";
    root.appendChild(el);
    var by = {};
    Array.prototype.forEach.call(el.querySelectorAll("[data-k]"), function (n) { by[n.getAttribute("data-k")] = n; });
    rows = [[by.wx, by.tv, by.h1, by.h2, by.h3, by.h4], [by.wx, by.apps, by.hs, by.tvs]];
  }

  function paint() {
    Array.prototype.forEach.call(el.querySelectorAll(".on"), function (n) { n.classList.remove("on"); });
    var f = rows[ri][ci];
    if (f) f.classList.add("on");
  }

  function loadWeather() {
    var body = el.querySelector(".cp-wxbody"), cfg = window.tv && window.tv.weatherCfg && window.tv.weatherCfg();
    if (!cfg || !window.WeatherTV) return;
    window.WeatherTV.load(cfg, function (w) { try { body.innerHTML = window.WeatherTV.mini(cfg, w); } catch (e) {} },
      function () { body.textContent = t("wx_error"); });   // no saved weather and no network
  }

  // What a card does. The page scrolls back first, so the screen you come back to is the home.
  function act(k) {
    var ids = { tv: "tv", h1: "HDMI:1", h2: "HDMI:2", h3: "HDMI:3", h4: "HDMI:4" };
    if (ids[k]) { close(function () { window.TVOS.openInput(ids[k]); }); return; }
    if (k === "wx") { if (window.WeatherTV) window.WeatherTV.open(); }   // over this page: the home is not brought back in between
    else if (k === "apps") openApps();
    else if (k === "hs") close(function () { if (window.tv && window.tv.homeSettings) window.tv.homeSettings(); });
    else if (k === "tvs") close(function () { window.TVOS.launch("com.android.tv.settings"); });
  }

  // ---- every app on the TV, A to Z
  // The home's own dock grown into a full list, as "More apps" does it: the same glass panel and the same tiles
  // (the home's own .grid and .tile.app styles), dimmed until focused, the focused one lifted with its white ring and
  // its name below. A to Z, the first app of each letter marked, with the letters along the top.
  var COLS = 10;
  function letterOf(name) {
    var c = String(name || "#").charAt(0).toUpperCase();
    try { c = c.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return /[A-Z]/.test(c) ? c : "#";
  }
  function openApps() {
    var list = [];
    try { list = JSON.parse(window.TVOS.apps()); } catch (e) {}
    list = list.filter(function (a) { return a.package.indexOf("local.") !== 0; });
    var loc = window.I18N ? window.I18N.locale() : "en";
    list.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), loc, { sensitivity: "base" }); });
    var present = {};
    list.forEach(function (a) { a.letter = letterOf(a.label); present[a.letter] = true; });
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
    popup = document.createElement("div");
    popup.id = "cp-apps";
    popup.innerHTML = '<div class="cpa-wrap"><div class="cpa-head"><h2>' + esc(t("apps")) + '</h2><span class="cpa-count">' + list.length + '</span><div class="cpa-az">' +
      letters.map(function (l) { return '<b class="' + (present[l] ? "has" : "") + '" data-l="' + l + '">' + l + "</b>"; }).join("") + "</div></div>" +
      '<div class="grid cpa-grid">' + list.map(function (a) {
        var u = window.TVOS.iconUrl(a.package);
        // the same faces the dock draws: the app's picture, or its name on a plain tile
        var face = u ? '<div class="face"><img src="' + esc(u) + '" alt="" decoding="async" onerror="this.parentNode.className=\'face word\';this.parentNode.textContent=this.getAttribute(\'data-name\')" data-name="' + esc(a.label) + '"></div>'
          : '<div class="face word">' + esc(a.label) + "</div>";
        return '<div class="tile app dock-ic">' + face + '<div class="label">' + esc(a.label) + "</div></div>";
      }).join("") + '</div><div class="cpa-hint">' + esc(t("cp_hint")) + "</div></div>";
    popup.apps = list;
    root.appendChild(popup);
    root.classList.add("cp-apps-open");   // the widgets step aside while the list is up
    setTimeout(function () { if (popup && window.tv && window.tv.fitClocks) window.tv.fitClocks(); }, 520);   // the clock clears its heading once it has risen
    pop.tiles = Array.prototype.slice.call(popup.querySelectorAll(".tile"));
    pop.i = 0;
    popPaint(true);
  }
  function popPaint(instant) {
    pop.tiles.forEach(function (n, i) { n.classList.toggle("focus", i === pop.i); });
    var f = pop.tiles[pop.i], box = popup.querySelector(".cpa-grid"), a = popup.apps[pop.i];
    Array.prototype.forEach.call(popup.querySelectorAll(".cpa-az b"), function (b) { b.classList.toggle("now", !!a && b.getAttribute("data-l") === a.letter); });
    if (!f) return;
    // the focused row is kept in the middle of the panel
    var want = f.offsetTop - (box.clientHeight - f.offsetHeight) / 2;
    box.style.scrollBehavior = instant ? "auto" : "";
    box.scrollTop = Math.max(0, want);
  }
  function closeApps() { if (!popup) return; if (popup && popup.parentNode) popup.parentNode.removeChild(popup); popup = null; root.classList.remove("cp-apps-open"); if (window.tv && window.tv.fitClocks && isOpen) window.tv.fitClocks(); }
  function wake() { if (window.tv && window.tv.wake) window.tv.wake(); }   // the home's "hide after x seconds" must not take these keys as nobody being here
  function popKeys(e) {
    wake();
    var k = e.keyCode, n = pop.tiles.length;
    if (k === 10009 || k === 27 || k === 8) closeApps();
    else if (k === 37) pop.i = Math.max(0, pop.i - 1);
    else if (k === 39) pop.i = Math.min(n - 1, pop.i + 1);
    else if (k === 38) pop.i = pop.i - COLS >= 0 ? pop.i - COLS : pop.i;
    else if (k === 40) pop.i = Math.min(n - 1, pop.i + COLS);
    else if (k === 13) { var a = popup.apps[pop.i]; if (a) { e.preventDefault(); e.stopImmediatePropagation(); close(function () { window.TVOS.launch(a.package); }); return; } }
    if (popup) popPaint();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // Runs before the home's own keys: the home must not move behind this page.
  function keys(e) {
    if (document.getElementById("wx-panel")) return;   // the weather screen is over this page and has the keys
    wake();
    if (popup) { popKeys(e); return; }
    var k = e.keyCode;
    if (k === 10009 || k === 27 || k === 8) close();
    else if (k === 38) { if (ri === 0) close(); else { ri = 0; ci = Math.min(ci, rows[0].length - 1); paint(); } }
    else if (k === 40) { if (ri === 0) { ri = 1; ci = Math.min(ci, rows[1].length - 1); paint(); } }
    else if (k === 37) { ci = Math.max(0, ci - 1); paint(); }
    else if (k === 39) { ci = Math.min(rows[ri].length - 1, ci + 1); paint(); }
    else if (k === 13) { var c = rows[ri][ci]; if (c && !e.repeat) act(c.getAttribute("data-k")); }   // a held OK opens once
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function open() {
    if (isOpen || busy) return;
    busy = true; isOpen = true;
    wake();
    if (!el) build();
    ri = 0; ci = 1;
    paint();
    setTimeout(function () { if (isOpen) loadWeather(); }, 220);   // after the page is up, not in the key press
    el.style.display = "block";
    void el.offsetHeight;   // laid out below the screen first, so it rises
    root.classList.add("cp-open");
    document.addEventListener("keydown", keys, true);
    setTimeout(function () { busy = false; if (isOpen && window.tv && window.tv.fitClocks) window.tv.fitClocks(); }, 200);   // the clock clears the widgets
  }
  function close(cb) {
    if (!isOpen) { if (cb) cb(); return; }
    closeApps();
    isOpen = false; busy = true;
    root.classList.remove("cp-open");
    document.removeEventListener("keydown", keys, true);
    setTimeout(function () {
      busy = false;
      if (!isOpen && el) el.style.display = "none";
      if (!isOpen) { wake(); if (window.tv && window.tv.fitClocks) window.tv.fitClocks(); }   // back above the row, once the home is in place
      if (cb) cb();
    }, 200);
  }

  // the arrow under the dock: the page is below
  var hint = document.createElement("div");
  hint.id = "cp-hint";
  hint.innerHTML = '<svg viewBox="0 0 24 14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l9 8 9-8"/></svg>';
  document.body.appendChild(hint);

  window.ControlPanel = { open: open, close: close, isOpen: function () { return isOpen; }, hint: function (on) { hint.classList.toggle("on", !!on); } };
})();
