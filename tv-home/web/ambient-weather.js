// Weather-Responsive Ambient Overlays & Solar Celestial Color Grading for couch-tv
// Rain, snow and fog are not drawn frame by frame: each is a seamless transparent tile (backgrounds/fx/*.png, made by
// samsung/tools/make-weather-fx.py) that CSS slides on its own layer, which a TV graphics chip does without the processor
// (a canvas drawn at 30 frames a second was too much for a Samsung). Only a lightning strike is drawn, on the canvas, for about half
// a second every 7 to 20 seconds. Strict ES5 for legacy TV WebViews.
(function (root) {
  "use strict";

  var canvas = null;
  var ctx = null;
  var lightingEl = null;
  var layersEl = null;      // #wx-layers: the sliding tiles (app.css, "weather layers")
  var inited = false;

  var rafId = null;
  var isPaused = false;
  var enabled = false;      // off until the home says so (Home settings, Weather)
  var sunGradeEnabled = false;
  var lighterMode = false;

  var currentType = "clear"; // "rain", "snow", "fog", "storm", "clear"
  var level = 2;             // how hard: 1 light, 2 middling, 3 heavy (which layers show, and how strongly)

  var W = 1920;
  var H = 1080;
  var SCALE = root.MoonfinTV ? 0.5 : 1;   // the lightning canvas of the Samsung app has half the width and height

  // Thunderstorm lightning: a forked bolt that flickers and lights the sky around it
  var strikeTimer = null;
  var boltAt = 0;            // when the bolt struck (0 = none showing)
  var boltMain = [];         // the main bolt, [x, y] pairs from the top
  var boltForks = [];        // the forks: each a list of [x, y]
  var boltX = 0;             // where the sky lights up from
  var drawing = false;
  var hushUntil = 0, hushTimer = null;

  // WMO weather code categorization (Open-Meteo standard)
  var RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  var SNOW_CODES = [71, 73, 75, 77, 85, 86];
  var FOG_CODES = [45, 48];
  var STORM_CODES = [95, 96, 99];
  // how hard, from the code: drizzle and light rain 1, steady rain and showers 2, heavy rain and storms 3 (snow the same)
  var LEVEL = { 51: 1, 53: 1, 55: 2, 56: 1, 57: 2, 61: 1, 63: 2, 65: 3, 66: 2, 67: 3, 80: 2, 81: 2, 82: 3, 95: 3, 96: 3, 99: 3,
    71: 1, 73: 2, 75: 3, 77: 1, 85: 2, 86: 3, 45: 2, 48: 3 };

  function getQueryParam(name) {
    var m = (root.location && root.location.search) ? root.location.search.match(new RegExp("[?&]" + name + "=([^&]+)")) : null;
    return m ? decodeURIComponent(m[1]) : null;
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  // ---- the layers: the container classes say which tiles show (app.css, "weather layers") ----
  function setLayers(type, lv) {
    if (!layersEl) return;
    layersEl.className = "wx-layers" + (type ? " on wx-" + (type === "storm" ? "rain" : type) + " lv" + lv : "") + (isPaused ? " paused" : "") + (Date.now() < hushUntil ? " hush" : "");
  }

  // ---- lightning ----
  // The bolt is grown by random midpoint displacement (each segment is split and its middle pushed sideways, again and again), so it is
  // jagged like the real thing; forks leave it at a few points and are grown the same way. Built once per strike.
  function grow(x1, y1, x2, y2, off, out) {
    if (off < 5) { out.push([x2, y2]); return; }
    var mx = (x1 + x2) / 2 + randomRange(-off, off), my = (y1 + y2) / 2 + randomRange(-off * 0.25, off * 0.25);
    grow(x1, y1, mx, my, off / 2, out);
    grow(mx, my, x2, y2, off / 2, out);
  }
  // The strike stands in the distance: it comes out of the cloud base, near the middle of the screen where the clock is, and ends ON the ground line of
  // the picture (groundFn: where the scenery begins at that x), small and thin, with the sky glowing round its top and a glow where it lands. How far
  // away it is (dist, 0.5 to 1) sets how thick and bright it is. Sometimes there is only sheet lightning: the cloud lights up with no bolt in it.
  var groundFn = function () { return 0.58; };
  var dist = 0.7, sheetOnly = false, boltGround = [0, 0], boltTop = [0, 0];
  function buildBolt() {
    var x0 = randomRange(W * 0.28, W * 0.72), y0 = randomRange(H * 0.05, H * 0.2), i;
    dist = randomRange(0.5, 0.95);
    sheetOnly = Math.random() < 0.28;
    var g = groundFn(x0 / W), x1 = x0 + randomRange(-110, 110), y1 = (groundFn(x1 / W) + randomRange(0.0, 0.05)) * H;
    boltTop = [x0, y0]; boltGround = [x1, y1];
    boltMain = [[x0, y0]];
    boltForks = [];
    if (!sheetOnly) {
      grow(x0, y0, x1, y1, 70 * dist, boltMain);
      var forks = 1 + Math.floor(Math.random() * 3);
      for (i = 0; i < forks; i++) {   // short branches off the upper part, going down and to the side, thinning out
        var at = boltMain[2 + Math.floor(Math.random() * Math.max(1, boltMain.length * 0.5 - 2))], dir = Math.random() < 0.5 ? -1 : 1, f = [[at[0], at[1]]];
        grow(at[0], at[1], at[0] + dir * randomRange(40, 120) * dist, at[1] + randomRange(60, 150) * dist, 26 * dist, f);
        boltForks.push(f);
      }
      // where it reaches the ground it splits into a few short, low branches
      for (i = 0; i < 2; i++) {
        var f2 = [[x1, y1]];
        grow(x1, y1, x1 + (i ? 1 : -1) * randomRange(18, 60) * dist, y1 + randomRange(4, 22) * dist, 10 * dist, f2);
        boltForks.push(f2);
      }
    }
    boltX = x0;
  }
  function pathOf(list) {
    for (var j = 0; j < list.length; j++) {
      var pts = list[j];
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    }
  }
  // How bright the strike is t ms after it began: a return stroke, a flicker, then stronger strokes, dying away (as long as the sky glow lasts).
  function boltLevel(t) {
    if (t < 55) return 1;
    if (t < 110) return 0.18;
    if (t < 190) return 0.9;
    if (t < 235) return 0.3;
    if (t < 330) return 0.65;
    if (t < 760) return 0.65 * (1 - (t - 330) / 430);
    return 0;
  }
  function glow(cx, cy, rx, ry, a) {   // a soft light, wide and low (an ellipse: cloud, not a spotlight)
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(215, 228, 255, " + a.toFixed(3) + ")");
    g.addColorStop(0.45, "rgba(190, 210, 255, " + (a * 0.38).toFixed(3) + ")");
    g.addColorStop(1, "rgba(180, 200, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  function drawBolt(lv) {
    var a = lv * (0.55 + 0.45 * dist), ground = boltGround[1];
    // the cloud lights up from within, round the top of the strike (never the whole screen), and the ground where it lands
    glow(boltTop[0], boltTop[1] + 40, W * (sheetOnly ? 0.55 : 0.4), H * 0.2, (sheetOnly ? 0.46 : 0.5) * a);
    if (!sheetOnly) {
      glow(boltGround[0], ground, 170 * dist + 50, 34 * dist + 12, 0.7 * a);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      var k = 0.55 + 0.9 * dist;   // thicker when nearer
      var passes = [[16 * k, 0.16, "150, 180, 255"], [7 * k, 0.4, "185, 208, 255"], [2.8 * k, 1, "252, 253, 255"]], i;
      for (i = 0; i < 3; i++) {   // glow, halo, core
        ctx.beginPath(); pathOf([boltMain]);
        ctx.lineWidth = passes[i][0]; ctx.strokeStyle = "rgba(" + passes[i][2] + ", " + (passes[i][1] * a).toFixed(3) + ")"; ctx.stroke();
        ctx.beginPath(); pathOf(boltForks);
        ctx.lineWidth = passes[i][0] * 0.5; ctx.strokeStyle = "rgba(" + passes[i][2] + ", " + (passes[i][1] * 0.75 * a).toFixed(3) + ")"; ctx.stroke();
      }
    }
  }
  function frame() {   // a few frames while the bolt shows, then the canvas is left empty and nothing runs
    rafId = null;
    var lv = boltLevel(Date.now() - boltAt);
    ctx.clearRect(0, 0, W, H);
    if (lv <= 0) { drawing = false; boltAt = 0; return; }
    drawBolt(lv);
    rafId = root.requestAnimationFrame(frame);
  }
  function strikeNow() {
    strikeTimer = null;
    if (currentType !== "storm" || !enabled || lighterMode || !ctx) return;
    if (!isPaused && Date.now() >= hushUntil) {   // not while someone moves along the rows: it waits for the next turn
      buildBolt();
      boltAt = Date.now();
      if (!drawing) { drawing = true; rafId = root.requestAnimationFrame(frame); }
    }
    scheduleStrike(randomRange(7000, 20000));
  }
  function scheduleStrike(ms) {
    if (strikeTimer) root.clearTimeout(strikeTimer);
    strikeTimer = root.setTimeout(strikeNow, ms);
  }
  function stopLightning() {
    if (strikeTimer) { root.clearTimeout(strikeTimer); strikeTimer = null; }
    if (rafId) { root.cancelAnimationFrame(rafId); rafId = null; }
    drawing = false;
    boltAt = 0;
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  // Draws (or clears) the current weather: called when the weather, or a setting that gates it, changes.
  function applyType() {
    stopLightning();
    if (lightingEl) lightingEl.classList.remove("has-weather-tint", "wx-rain-tint", "wx-snow-tint", "wx-fog-tint", "wx-storm-tint");
    setLayers(null);
    if (!inited || currentType === "clear" || !enabled || lighterMode) return;
    if (lightingEl) lightingEl.classList.add("has-weather-tint", "wx-" + currentType + "-tint");
    setLayers(currentType, level);
    if (currentType === "storm" && !isPaused) scheduleStrike(randomRange(3000, 8000));
  }

  function setWeatherType(type, lv) {
    if (currentType === type && level === lv) return;
    currentType = type;
    level = lv;
    applyType();
  }

  // Astronomical Solar Color Grading mapping
  function applySolarColorGrading(sunPos) {
    if (!lightingEl) return;
    if (!sunGradeEnabled) {
      lightingEl.style.backgroundImage = "";
      lightingEl.style.opacity = "";
      return;
    }

    var alt = sunPos ? sunPos.alt : 20;
    var isMorning = sunPos ? (sunPos.hourAngle < 0) : true;

    // Test override from URL parameter: ?test_alt=-5
    var testAlt = getQueryParam("test_alt");
    if (testAlt !== null && isFinite(Number(testAlt))) {
      alt = Number(testAlt);
    }

    var gradient = "";
    var opacity = 1.0;

    if (alt < -12) {
      // Midnight & Deep Astronomical Night: deep cool navy, calm dimming
      gradient = "linear-gradient(180deg, rgba(8, 12, 24, 0.32) 0%, rgba(5, 8, 18, 0.45) 100%)";
    } else if (alt < -4) {
      // Nautical Twilight / Blue Hour: deep violet-indigo
      gradient = isMorning
        ? "linear-gradient(175deg, rgba(24, 18, 48, 0.28) 0%, rgba(45, 26, 60, 0.22) 100%)"
        : "linear-gradient(175deg, rgba(35, 18, 55, 0.32) 0%, rgba(14, 18, 42, 0.38) 100%)";
    } else if (alt < 2) {
      // Civil Twilight / Sunrise & Sunset: delicate rose, peach and violet glow
      gradient = isMorning
        ? "linear-gradient(185deg, rgba(255, 130, 90, 0.18) 0%, rgba(200, 85, 130, 0.12) 65%, rgba(40, 20, 60, 0.22) 100%)"
        : "linear-gradient(185deg, rgba(245, 100, 65, 0.22) 0%, rgba(175, 60, 115, 0.18) 60%, rgba(30, 18, 55, 0.28) 100%)";
    } else if (alt < 12) {
      // Golden Hour: rich honey-amber warmth
      gradient = isMorning
        ? "linear-gradient(190deg, rgba(255, 180, 105, 0.15) 0%, rgba(255, 140, 70, 0.08) 70%, rgba(0, 0, 0, 0) 100%)"
        : "linear-gradient(190deg, rgba(255, 150, 50, 0.18) 0%, rgba(220, 100, 45, 0.12) 65%, rgba(0, 0, 0, 0) 100%)";
    } else {
      // Midday / Daylight: crisp natural light
      gradient = "linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(0, 0, 0, 0) 70%)";
      opacity = 0.5;
    }

    lightingEl.style.backgroundImage = gradient;
    lightingEl.style.opacity = opacity;
  }

  var API = {
    init: function (canvasElement, lightingElement) {
      canvas = canvasElement;
      lightingEl = lightingElement;
      layersEl = root.document && root.document.getElementById ? root.document.getElementById("wx-layers") : null;
      if (canvas && canvas.getContext) {
        canvas.width = W * SCALE;   // only the lightning is drawn here
        canvas.height = H * SCALE;
        ctx = canvas.getContext("2d");
        if (SCALE !== 1 && ctx.setTransform) ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);   // the drawing keeps its 1920x1080 numbers
      }
      inited = true;
      applyType();   // the weather may have been set before the canvas was

      // Check test overrides
      var testWx = getQueryParam("test_wx");
      if (testWx !== null && isFinite(Number(testWx))) {
        API.setWeather({ code: Number(testWx), temp: 20 }, null);
      }
    },

    setWeather: function (weatherData, sunPos) {
      if (sunPos) applySolarColorGrading(sunPos);

      var testWx = getQueryParam("test_wx");
      var code = (testWx !== null && isFinite(Number(testWx))) ? Number(testWx) : (weatherData ? weatherData.code : null);

      if (code == null) {
        setWeatherType("clear", 2);
        return;
      }
      var lv = LEVEL[code] || 2;
      if (STORM_CODES.indexOf(code) >= 0) {
        setWeatherType("storm", lv);
      } else if (RAIN_CODES.indexOf(code) >= 0) {
        setWeatherType("rain", lv);
      } else if (SNOW_CODES.indexOf(code) >= 0) {
        setWeatherType("snow", lv);
      } else if (FOG_CODES.indexOf(code) >= 0) {
        setWeatherType("fog", lv);
      } else {
        setWeatherType("clear", 2);
      }
    },

    setSolarGrading: function (sunPos) {
      applySolarColorGrading(sunPos);
    },

    pause: function () {
      isPaused = true;
      stopLightning();
      if (layersEl) layersEl.classList.add("paused");
    },

    resume: function () {
      isPaused = false;
      if (layersEl) layersEl.classList.remove("paused");
      if (currentType === "storm" && enabled && !lighterMode) scheduleStrike(randomRange(3000, 8000));
    },

    setEnabled: function (val) {
      val = !!val;
      if (val === enabled) return;
      enabled = val;
      applyType();
    },

    setSunGradeEnabled: function (val) {
      sunGradeEnabled = !!val;
      if (lightingEl && !sunGradeEnabled) {
        lightingEl.style.backgroundImage = "";
        lightingEl.style.opacity = "";
      }
    },

    setLighter: function (val) {
      val = !!val;
      if (val === lighterMode) return;
      lighterMode = val;
      applyType();
    },

    getType: function () {
      return currentType;
    },

    // stand still for ms milliseconds (the page calls it on every key press): the tiles stop sliding, so a weak TV has all its frames for the rows
    hush: function (ms) {
      hushUntil = Date.now() + ms;
      if (layersEl) layersEl.classList.add("hush");
      if (hushTimer) root.clearTimeout(hushTimer);
      hushTimer = root.setTimeout(function () { hushTimer = null; if (layersEl && Date.now() >= hushUntil) layersEl.classList.remove("hush"); }, ms + 50);
    },

    // where the ground is in the picture on show: fn(x as a share of the width) -> y as a share of the height (the lightning ends there; the rain and
    // snow fade out below it: --wx-ground on the layers, app.css)
    setGround: function (fn, mid) {
      if (typeof fn === "function") groundFn = fn;
      if (layersEl && layersEl.style && mid != null) layersEl.style.setProperty("--wx-ground", String(mid));
    },

    // a strike right now (a preview, and for tests); only in a storm
    strike: function () {
      if (currentType === "storm" && enabled && !lighterMode && ctx) { hushUntil = 0; strikeNow(); }
    }
  };

  root.AmbientWeather = API;
})(typeof window !== "undefined" ? window : this);
