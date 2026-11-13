// The weather panel (the Weather tile in the dock): the place and unit Home settings has, with the
// conditions now, the next hours and the next seven days, from Open-Meteo (free, no key).
// The last answer is kept, so the panel opens with it at once and updates when the new one arrives.
(function () {
  "use strict";
  var KEY = "couch.wx", FRESH = 10 * 60000;

  function t(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }

  // ---- the words and pictures for Open-Meteo's weather codes
  function word(code) {
    if (code === 0) return "wx_clear";
    if (code === 1) return "wx_mostly_clear";
    if (code === 2) return "wx_partly";
    if (code === 3) return "wx_cloudy";
    if (code === 45 || code === 48) return "wx_fog";
    if (code >= 51 && code <= 57) return "wx_drizzle";
    if (code === 61) return "wx_light_rain";
    if (code === 65) return "wx_heavy_rain";
    if (code >= 61 && code <= 67) return "wx_rain";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "wx_snow";
    if (code === 82) return "wx_heavy_showers";
    if (code === 80 || code === 81) return "wx_showers";
    if (code >= 95) return "wx_storms";
    return "wx_cloudy";
  }
  var CLOUD = '<path d="M13 35h21a8.5 8.5 0 0 0 .9-16.9A11.5 11.5 0 0 0 12.6 21.4 7 7 0 0 0 13 35z"/>';
  var SUN = '<circle cx="24" cy="24" r="7"/><path d="M24 7v5M24 36v5M7 24h5M36 24h5M12 12l3.5 3.5M32.5 32.5L36 36M36 12l-3.5 3.5M15.5 32.5L12 36"/>';
  var MOON = '<path d="M35 29A13 13 0 1 1 19 13a10 10 0 0 0 16 16z"/>';
  function icon(code, day) {
    var inner;
    if (code === 0 || code === 1) inner = day ? SUN : MOON;
    else if (code === 2) inner = (day ? '<circle cx="17" cy="16" r="5.5"/><path d="M17 5v3M6 16h3M9 8l2 2M25 8l-2 2"/>' : '<path d="M24 14A8 8 0 1 1 15 6a6 6 0 0 0 9 8z"/>') + '<g transform="translate(5 3)">' + CLOUD + "</g>";
    else if (code === 45 || code === 48) inner = '<path d="M10 17h28M8 25h32M12 33h24M16 41h16"/>';
    else if (code >= 51 && code <= 67 || code >= 80 && code <= 82) inner = CLOUD + '<path d="M16 40l-2 5M24 40l-2 5M32 40l-2 5"/>';
    else if (code >= 71 && code <= 77 || code === 85 || code === 86) inner = CLOUD + '<path d="M16 41v.1M24 45v.1M32 41v.1M20 43v.1M28 40v.1" stroke-width="3.2"/>';
    else if (code >= 95) inner = CLOUD + '<path d="M26 32l-5 8h5l-3 7 8-10h-5l3-5z"/>';
    else inner = CLOUD;
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }

  // ---- asking Open-Meteo
  function fetchWeather(cfg, done) {
    var f = !!cfg.f;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + cfg.lat + "&longitude=" + cfg.lon +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,weather_code,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max" +
      "&timezone=" + encodeURIComponent(cfg.timezone || "auto") + "&forecast_days=7" +
      (f ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "&wind_speed_unit=kmh");
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.timeout = 15000;
    x.onload = function () {
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) {}
      if (x.status === 200 && j && j.current) done(null, j); else done("bad");
    };
    x.onerror = x.ontimeout = function () { done("net"); };
    x.send();
  }

  // ---- drawing it
  function hourLabel(iso) {
    var h = parseInt(iso.substring(11, 13), 10);
    if ((window.tv && window.tv.clock24 ? window.tv.clock24() : window.I18N && window.I18N.clock() === "24h")) return (h < 10 ? "0" : "") + h + ":00";
    return (h % 12 || 12) + (h < 12 ? " am" : " pm");
  }
  function dayLabel(iso, i, cfg) {
    if (i === 0) return t("wx_today");
    var d = new Date(iso + "T12:00:00");
    try { return d.toLocaleDateString(window.I18N ? window.I18N.locale() : "en", { weekday: "short" }); } catch (e) { return iso.substring(5); }
  }
  function draw(box, cfg, w) {
    var c = w.current, h = w.hourly, d = w.daily, deg = function (v) { return Math.round(v) + "°"; };
    var unit = cfg.f ? "mph" : "km/h", now = c.time || "";
    var at = Math.max(0, h.time.findIndex(function (x) { return x >= now.substring(0, 13); }));
    var hours = h.time.slice(at, at + 12).map(function (iso, k) {
      var i = at + k, p = h.precipitation_probability[i];
      return '<div class="wx-h"><span>' + (k === 0 ? esc(t("wx_now")) : esc(hourLabel(iso))) + "</span><i>" + icon(h.weather_code[i], h.is_day[i]) + "</i><b>" + deg(h.temperature_2m[i]) + "</b><small>" + (p ? p + "%" : "") + "</small></div>";
    }).join("");
    var lo = Math.min.apply(null, d.temperature_2m_min), hi = Math.max.apply(null, d.temperature_2m_max);
    var days = d.time.map(function (iso, i) {
      var a = (d.temperature_2m_min[i] - lo) / ((hi - lo) || 1) * 100, b = (d.temperature_2m_max[i] - lo) / ((hi - lo) || 1) * 100, p = d.precipitation_probability_max[i];
      return '<div class="wx-d"><span>' + esc(dayLabel(iso, i, cfg)) + "</span><i>" + icon(d.weather_code[i], 1) + "</i><small>" + (p ? p + "%" : "") + "</small><em>" + deg(d.temperature_2m_min[i]) +
        '</em><span class="wx-bar"><u style="left:' + a.toFixed(0) + "%;width:" + Math.max(8, b - a).toFixed(0) + '%"></u></span><b>' + deg(d.temperature_2m_max[i]) + "</b></div>";
    }).join("");
    var rain = Math.max.apply(null, h.precipitation_probability.slice(at, at + 12).concat([0]));
    var stat = function (k, v) { return '<div class="wx-s"><small>' + esc(t(k)) + "</small><b>" + esc(v) + "</b></div>"; };
    var date = "";
    try { date = new Date().toLocaleDateString(window.I18N ? window.I18N.locale() : "en", { weekday: "long", day: "numeric", month: "long", timeZone: cfg.timezone && cfg.timezone !== "auto" ? cfg.timezone : undefined }); } catch (e) {}
    box.className = c.is_day ? "wx-day" : "wx-night";
    box.innerHTML = '<div class="wx-grid"><div class="wx-main"><h1>' + esc(cfg.place || "") + "</h1><p>" + esc(date) + "</p>" +
      '<div class="wx-now"><i>' + icon(c.weather_code, c.is_day) + "</i><b>" + deg(c.temperature_2m) + "</b><span>" + esc(t(word(c.weather_code))) + "</span></div>" +
      '<div class="wx-stats">' + stat("wx_feels", deg(c.apparent_temperature)) + stat("wx_humidity", Math.round(c.relative_humidity_2m) + "%") +
      stat("wx_wind", Math.round(c.wind_speed_10m) + " " + unit) + stat("wx_rain_chance", rain + "%") +
      stat("wx_sunrise", d.sunrise[0].substring(11, 16)) + stat("wx_sunset", d.sunset[0].substring(11, 16)) + "</div></div>" +
      '<div class="wx-side"><h3>' + esc(t("wx_daily")) + "</h3>" + days + "</div>" +
      '<div class="wx-hours"><h3>' + esc(t("wx_hourly")) + "</h3><div>" + hours + "</div></div></div><small class=\"wx-hint\">" + esc(t("wx_back_hint")) + "</small>";
  }

  // For the widgets page: the answer kept from last time at once, then a fresh one when it is over ten minutes old.
  function load(cfg, cb, fail) {
    var shownKept = false;
    var key = cfg.lat + "," + cfg.lon + "," + (cfg.f ? "f" : "c"), kept = read();
    if (kept && kept.key === key && kept.data) { shownKept = true; cb(kept.data); if (Date.now() - kept.at < FRESH) return; }
    fetchWeather(cfg, function (err, w) {
      if (err) { if (!shownKept && fail) fail(); return; }   // what is shown stays
      try { localStorage.setItem(KEY, JSON.stringify({ key: key, at: Date.now(), data: w })); } catch (e) {}
      cb(w);
    });
  }

  // The small card on the widgets page: place, temperature, the day's range and the next hours.
  function mini(cfg, w) {
    var c = w.current, h = w.hourly, d = w.daily, deg = function (v) { return Math.round(v) + "\u00b0"; };
    var at = Math.max(0, h.time.findIndex(function (x) { return x >= (c.time || "").substring(0, 13); }));
    var hours = [1, 2, 3, 4].map(function (k) {
      var i = at + k * 2;
      return h.time[i] ? '<div><span>' + esc(hourLabel(h.time[i])) + "</span><i>" + icon(h.weather_code[i], h.is_day[i]) + "</i><b>" + deg(h.temperature_2m[i]) + "</b></div>" : "";
    }).join("");
    return "<h3>" + esc(cfg.place || "") + '</h3><div class="cpw-now"><i>' + icon(c.weather_code, c.is_day) + "</i><b>" + deg(c.temperature_2m) + "</b></div><p>" +
      esc(t(word(c.weather_code))) + " \u00b7 " + deg(d.temperature_2m_max[0]) + " / " + deg(d.temperature_2m_min[0]) + '</p><div class="cpw-h">' + hours + "</div>";
  }

  function open() {
    if (document.getElementById("wx-panel") || !window.tv || !window.tv.weatherCfg) return;
    var cfg = window.tv.weatherCfg(), box = document.createElement("div");
    box.id = "wx-panel";
    box.className = "wx-night";
    box.innerHTML = '<div class="wx-msg">' + esc(t("wx_loading")) + "</div>";
    document.body.appendChild(box);
    var key = cfg.lat + "," + cfg.lon + "," + (cfg.f ? "f" : "c"), alive = true;
    function close() { alive = false; document.removeEventListener("keydown", keys, true); if (box.parentNode) box.parentNode.removeChild(box); }
    function keys(e) {
      if (e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 13) { e.preventDefault(); close(); }
      e.stopImmediatePropagation();
    }
    document.addEventListener("keydown", keys, true);
    var kept = read();
    var shown = false;
    if (kept && kept.key === key && kept.data) { try { draw(box, cfg, kept.data); shown = true; } catch (e) {} }
    if (kept && kept.key === key && Date.now() - kept.at < FRESH && shown) return;
    fetchWeather(cfg, function (err, w) {
      if (!alive) return;
      if (err) { if (!shown) box.innerHTML = '<div class="wx-msg">' + esc(t("wx_error")) + "</div><small class=\"wx-hint\">" + esc(t("wx_back_hint")) + "</small>"; return; }
      try { localStorage.setItem(KEY, JSON.stringify({ key: key, at: Date.now(), data: w })); } catch (e) {}
      try { draw(box, cfg, w); } catch (e) { box.innerHTML = '<div class="wx-msg">' + esc(t("wx_error")) + "</div>"; }
    });
  }

  window.WeatherTV = { open: open, load: load, mini: mini };
})();
