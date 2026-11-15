// Weather-Responsive Ambient Overlays & Solar Celestial Color Grading for couch-tv
// Pure client-side procedural 2D canvas particle physics + smooth astronomical lighting tints.
// Strict ES5 compatibility for legacy TV WebViews (Chrome 44+ on Android 6 / Fire OS 6).
(function (root) {
  "use strict";

  var canvas = null;
  var ctx = null;
  var lightingEl = null;

  var running = false;
  var rafId = null;
  var isPaused = false;
  var enabled = false;      // off until the home says so (Home settings, Weather)
  var sunGradeEnabled = false;
  var lighterMode = false;

  var currentType = "clear"; // "rain", "snow", "fog", "storm", "clear"
  var particles = [];
  var fogNodes = [];
  var MAX_RAIN = 240;   // the pool; how many are drawn depends on how hard it rains (rainN)
  var MAX_SNOW = 320;
  var PERF = root.MoonfinTV ? 0.6 : 1;   // the Samsung app draws fewer drops and flakes, on a canvas of a quarter of the pixels
  var rainN = Math.round(110 * PERF), snowN = Math.round(160 * PERF);
  var hushUntil = 0;   // while someone moves along the rows the drawing stands still (hush)
  var MAX_FOG = 4;

  var W = 1920;
  var H = 1080;
  var lastTime = 0;

  // Thunderstorm lightning state: a forked bolt that flickers and lights the sky around it
  var nextFlashTime = 0;
  var boltAt = 0;            // when the bolt struck (0 = none showing)
  var boltMain = [];         // the main bolt, [x, y] pairs from the top
  var boltForks = [];        // the forks: each a list of [x, y]
  var boltX = 0;             // where the sky lights up from

  // WMO weather code categorization (Open-Meteo standard)
  var RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  var SNOW_CODES = [71, 73, 75, 77, 85, 86];
  var FOG_CODES = [45, 48];
  var STORM_CODES = [95, 96, 99];

  function getQueryParam(name) {
    var m = (root.location && root.location.search) ? root.location.search.match(new RegExp("[?&]" + name + "=([^&]+)")) : null;
    return m ? decodeURIComponent(m[1]) : null;
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Pre-allocate particles for zero-garbage-collection rendering at 60fps
  function initParticlePool() {
    particles = [];
    var i;
    for (i = 0; i < Math.max(MAX_RAIN, MAX_SNOW); i++) {   // rain and snow share the pool: it holds the bigger of the two
      particles.push({
        x: Math.random() * (W + 200) - 100,
        y: Math.random() * H,
        len: randomRange(25, 48),
        speed: randomRange(22, 34),
        alpha: randomRange(0.12, 0.32),
        width: randomRange(1.2, 1.8),
        d: 1,
        splash: 0,
        splashMax: randomRange(6, 14),
        splashX: 0,
        splashY: 0
      });
    }

    fogNodes = [];
    for (i = 0; i < MAX_FOG; i++) {
      fogNodes.push({
        x: randomRange(0, W),
        y: randomRange(H * 0.35, H * 0.95),
        radius: randomRange(260, 480),
        speed: randomRange(0.12, 0.28) * (Math.random() < 0.5 ? 1 : -1),
        alpha: randomRange(0.04, 0.08)
      });
    }
  }

  // Depth: 0 far (small, slow, faint), 1 middle, 2 near (big, fast, bright). Drawn in three batches, so a hard rain costs
  // three strokes a frame, not one per drop.
  function resetSnowParticle(p, startAnywhere) {
    var r = Math.random();
    p.d = r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
    p.x = Math.random() * (W + 100) - 50;
    p.y = startAnywhere ? Math.random() * H : -10;
    p.radius = p.d === 0 ? randomRange(1.3, 2.2) : p.d === 1 ? randomRange(2.3, 3.5) : randomRange(3.2, 5.0);
    p.speedY = p.d === 0 ? randomRange(0.8, 1.5) : p.d === 1 ? randomRange(1.5, 2.6) : randomRange(2.8, 4.2);
    p.speedX = randomRange(-0.4, 0.4);
    p.wobble = Math.random() * Math.PI * 2;
    p.wobbleSpeed = randomRange(0.015, 0.035);
    p.alpha = 1;
  }

  function resetRainParticle(p, startAnywhere) {
    var r = Math.random();
    p.d = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
    p.len = p.d === 0 ? randomRange(16, 28) : p.d === 1 ? randomRange(30, 50) : randomRange(54, 84);
    p.speed = p.d === 0 ? randomRange(14, 20) : p.d === 1 ? randomRange(24, 34) : randomRange(38, 50);
    p.x = Math.random() * (W + 300) - 150;
    p.y = startAnywhere ? Math.random() * H : -p.len;
    p.alpha = 1;
    p.width = 1;
    p.splash = 0;
    p.splashMax = randomRange(6, 14);
  }

  // Draws (or clears) the current weather: called when the weather, or a setting that gates it, changes.
  function applyType() {
    stopLoop();
    if (ctx) ctx.clearRect(0, 0, W, H);
    if (lightingEl) lightingEl.classList.remove("has-weather-tint", "wx-rain-tint", "wx-snow-tint", "wx-fog-tint", "wx-storm-tint");
    if (!canvas || !ctx || currentType === "clear" || !enabled || lighterMode) return;

    // Re-initialize particles for the type
    var count = currentType === "snow" ? snowN : rainN;
    for (var i = 0; i < count; i++) {
      if (currentType === "snow") resetSnowParticle(particles[i], true);
      else resetRainParticle(particles[i], true);
    }

    if (lightingEl) lightingEl.classList.add("has-weather-tint", "wx-" + currentType + "-tint");

    if (currentType === "storm") {
      nextFlashTime = Date.now() + randomRange(3000, 8000);
      boltAt = 0;
    }

    startLoop();
  }

  function setWeatherType(type) {
    if (currentType === type) return;
    currentType = type;
    applyType();
  }

  function startLoop() {
    if (running || isPaused || currentType === "clear" || !enabled || lighterMode) return;
    running = true;
    lastTime = Date.now();
    rafId = root.requestAnimationFrame(renderLoop);
  }

  function stopLoop() {
    running = false;
    if (rafId) {
      root.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Lightning. The bolt is grown by random midpoint displacement (each segment is split and its middle pushed sideways,
  // again and again), so it is jagged like the real thing; forks leave it at a few points and are grown the same way.
  // Built once per strike, so nothing is allocated per frame.
  function grow(x1, y1, x2, y2, off, out) {
    if (off < 5) { out.push([x2, y2]); return; }
    var mx = (x1 + x2) / 2 + randomRange(-off, off), my = (y1 + y2) / 2 + randomRange(-off * 0.25, off * 0.25);
    grow(x1, y1, mx, my, off / 2, out);
    grow(mx, my, x2, y2, off / 2, out);
  }
  function buildBolt() {
    var x0 = randomRange(W * 0.15, W * 0.85), x1 = x0 + randomRange(-160, 160), y1 = randomRange(H * 0.5, H * 0.72), i;
    boltMain = [[x0, -10]];
    grow(x0, -10, x1, y1, 110, boltMain);
    boltForks = [];
    var forks = 2 + Math.floor(Math.random() * 3);
    for (i = 0; i < forks; i++) {
      var at = boltMain[4 + Math.floor(Math.random() * (boltMain.length - 10))], dir = Math.random() < 0.5 ? -1 : 1, f = [[at[0], at[1]]];
      grow(at[0], at[1], at[0] + dir * randomRange(90, 260), at[1] + randomRange(140, 300), 56, f);
      boltForks.push(f);
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
  // How bright the strike is t ms after it began: a hard flash, a flicker, a second flash, then it dies away.
  function boltLevel(t) {
    if (t < 70) return 1;
    if (t < 130) return 0.25;
    if (t < 230) return 0.85;
    if (t < 600) return 0.85 * (1 - (t - 230) / 370);
    return 0;
  }
  function drawLightning(now) {
    if (!boltAt && now >= nextFlashTime) {
      buildBolt();
      boltAt = now;
      nextFlashTime = now + randomRange(7000, 20000);
    }
    if (!boltAt) return;
    var lv = boltLevel(now - boltAt);
    if (lv <= 0) { boltAt = 0; return; }
    // the sky lights up round the strike, brighter near the bolt and fading to the corners: never a blinding white screen
    var g = ctx.createRadialGradient(boltX, H * 0.25, 20, boltX, H * 0.25, W * 0.75);
    g.addColorStop(0, "rgba(205, 222, 255, " + (0.42 * lv).toFixed(3) + ")");
    g.addColorStop(1, "rgba(205, 222, 255, " + (0.1 * lv).toFixed(3) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    var passes = [[18, 0.10, "150, 180, 255"], [8, 0.24, "175, 200, 255"], [3, 0.97, "248, 250, 255"]], i;
    for (i = 0; i < 3; i++) {   // glow, halo, core
      ctx.beginPath(); pathOf([boltMain]);
      ctx.lineWidth = passes[i][0]; ctx.strokeStyle = "rgba(" + passes[i][2] + ", " + (passes[i][1] * lv).toFixed(3) + ")"; ctx.stroke();
      ctx.beginPath(); pathOf(boltForks);
      ctx.lineWidth = passes[i][0] * 0.5; ctx.strokeStyle = "rgba(" + passes[i][2] + ", " + (passes[i][1] * 0.8 * lv).toFixed(3) + ")"; ctx.stroke();
    }
  }

  function renderLoop() {
    if (!running) return;

    var now = Date.now();
    if (now < hushUntil) {   // someone is moving along the rows: leave the last picture as it is
      lastTime = now;
      rafId = root.requestAnimationFrame(renderLoop);
      return;
    }
    // 30 frames a second is plenty for slow rain and snow, and half the work for a weak box
    if (now - lastTime < 32) {
      rafId = root.requestAnimationFrame(renderLoop);
      return;
    }
    var dt = (now - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // clamp delta during lag spikes
    lastTime = now;
    var k = dt * 60; // movement is per 60th of a second, so the speed is the same at any frame rate

    ctx.clearRect(0, 0, W, H);

    var windAngle = 0.16; // gentle diagonal tilt ~9 degrees

    if (currentType === "rain" || currentType === "storm") {
      var RAIN_ALPHA = [0.16, 0.26, 0.40], RAIN_W = [1, 1.4, 2.1], d, rp;
      for (d = 0; d < 3; d++) {   // one path and one stroke for every depth
        ctx.beginPath();
        for (var r = 0; r < rainN; r++) {
          rp = particles[r];
          if (rp.d !== d || rp.splash > 0) continue;
          rp.y += rp.speed * k;
          rp.x += rp.speed * k * windAngle;
          if (rp.y >= H - randomRange(10, 80)) {
            rp.splash = d === 0 ? 0 : 1;   // far drops just end, the others splash
            rp.splashX = rp.x;
            rp.splashY = rp.y;
            if (!rp.splash) resetRainParticle(rp, false);
            continue;
          }
          ctx.moveTo(rp.x, rp.y);
          ctx.lineTo(rp.x - rp.len * windAngle, rp.y - rp.len);
        }
        ctx.strokeStyle = "rgba(205, 225, 255, " + RAIN_ALPHA[d] + ")";
        ctx.lineWidth = RAIN_W[d];
        ctx.stroke();
      }
      ctx.beginPath();   // the dying splash rings, in one batch
      for (var q = 0; q < rainN; q++) {
        rp = particles[q];
        if (rp.splash <= 0) continue;
        rp.splash += dt * 30;
        ctx.moveTo(rp.splashX + rp.splash * 1.5, rp.splashY);
        ctx.ellipse(rp.splashX, rp.splashY, rp.splash * 1.5, rp.splash * 0.6, 0, 0, Math.PI * 2);
        if (rp.splash >= rp.splashMax) resetRainParticle(rp, false);
      }
      ctx.strokeStyle = "rgba(220, 235, 255, 0.16)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (currentType === "storm") drawLightning(now);
    } else if (currentType === "snow") {
      var SNOW_ALPHA = [0.6, 0.8, 0.95], sp, sd;
      for (sd = 0; sd < 3; sd++) {
        ctx.beginPath();
        for (var s = 0; s < snowN; s++) {
          sp = particles[s];
          if (sp.d !== sd) continue;
          sp.wobble += sp.wobbleSpeed * k;
          sp.y += sp.speedY * k;
          sp.x += (Math.sin(sp.wobble) * (0.5 + 0.25 * sd) + sp.speedX) * k;
          if (sp.y > H + 10 || sp.x < -20 || sp.x > W + 20) resetSnowParticle(sp, false);
          ctx.moveTo(sp.x + sp.radius, sp.y);
          ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
        }
        ctx.fillStyle = "rgba(246, 250, 255, " + SNOW_ALPHA[sd] + ")";
        ctx.fill();
      }
    } else if (currentType === "fog") {
      for (var f = 0; f < fogNodes.length; f++) {
        var fn = fogNodes[f];
        fn.x += fn.speed * k;
        if (fn.speed > 0 && fn.x - fn.radius > W) fn.x = -fn.radius;
        if (fn.speed < 0 && fn.x + fn.radius < 0) fn.x = W + fn.radius;

        var grad = ctx.createRadialGradient(fn.x, fn.y, fn.radius * 0.1, fn.x, fn.y, fn.radius);
        grad.addColorStop(0, "rgba(220, 230, 240, " + fn.alpha.toFixed(3) + ")");
        grad.addColorStop(0.6, "rgba(220, 230, 240, " + (fn.alpha * 0.45).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(220, 230, 240, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(fn.x - fn.radius, fn.y - fn.radius, fn.radius * 2, fn.radius * 2);
      }
    }

    rafId = root.requestAnimationFrame(renderLoop);
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
      if (canvas && canvas.getContext) {
        // the Samsung app draws on half the width and height (a quarter of the pixels to clear and put on the screen each frame)
        canvas.width = root.MoonfinTV ? W / 2 : W;
        canvas.height = root.MoonfinTV ? H / 2 : H;
        ctx = canvas.getContext("2d");
        if (root.MoonfinTV && ctx.setTransform) ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);   // the drawing keeps its 1920x1080 numbers
        initParticlePool();
      }
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
        setWeatherType("clear");
        return;
      }

      // how hard: drizzle and light rain are few drops, heavy rain and storms many; snow the same
      var rn = { 51: 60, 53: 80, 55: 110, 56: 70, 57: 110, 61: 100, 63: 160, 65: 230, 66: 120, 67: 230, 80: 110, 81: 170, 82: 240, 95: 180, 96: 230, 99: 240 }[code];
      var sn = { 71: 90, 73: 170, 75: 280, 77: 90, 85: 140, 86: 280 }[code];
      var same = (rn && currentType === (code >= 95 ? "storm" : "rain")) || (sn && currentType === "snow");
      var changed = (rn && Math.round(rn * PERF) !== rainN) || (sn && Math.round(sn * PERF) !== snowN);
      if (rn) rainN = Math.round(rn * PERF);
      if (sn) snowN = Math.round(sn * PERF);
      if (changed && same) applyType();   // the same weather, harder or softer
      if (STORM_CODES.indexOf(code) >= 0) {
        setWeatherType("storm");
      } else if (RAIN_CODES.indexOf(code) >= 0) {
        setWeatherType("rain");
      } else if (SNOW_CODES.indexOf(code) >= 0) {
        setWeatherType("snow");
      } else if (FOG_CODES.indexOf(code) >= 0) {
        setWeatherType("fog");
      } else {
        setWeatherType("clear");
      }
    },

    setSolarGrading: function (sunPos) {
      applySolarColorGrading(sunPos);
    },

    pause: function () {
      isPaused = true;
      stopLoop();
    },

    resume: function () {
      isPaused = false;
      if (currentType !== "clear" && enabled && !lighterMode) {
        startLoop();
      }
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

    // stand still for ms milliseconds (the page calls it on every key press)
    hush: function (ms) { hushUntil = Date.now() + ms; },

    // a strike right now (a preview, and for tests); only in a storm
    strike: function () {
      if (currentType === "storm") { nextFlashTime = 0; boltAt = 0; }
    }
  };

  root.AmbientWeather = API;
})(typeof window !== "undefined" ? window : this);
