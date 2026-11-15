// The five places, each with 30 pictures (5 weathers x 6 times of day): which place is up, which pictures fit the
// sun and the sky now, and how far the day has moved between two of them. Pure functions (no page, no clock of their
// own), so tests/test_places.js can run them. ES5 for the TV's browser.
(function (root) {
  "use strict";

  // The times of day, in the order the sun walks through them; the day is a ring: sunset leads back to night.
  var TIMES = ["night", "sunrise", "morning", "midday", "golden", "sunset"];
  var WEATHERS = ["clear", "partly", "cloudy", "dark", "snow"];

  // What the sky is doing (app.js weatherKind) -> the picture set that shows it. Rain, snow flakes and lightning are drawn
  // over the picture (ambient-weather.js), never in it.
  function weatherSet(kind) {
    if (kind === "partly") return "partly";
    if (kind === "cloudy" || kind === "fog" || kind === "drizzle") return "cloudy";
    if (kind === "rain" || kind === "storm") return "dark";
    if (kind === "snow") return "snow";
    return "clear";   // clear, mostly clear and a service that has not answered
  }

  // The highest the sun gets today at this latitude (degrees), from the day of the year (1 to 366).
  function maxAltitude(lat, dayOfYear) {
    var decl = 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
    return 90 - Math.abs(lat - decl);
  }

  // Where the sun is on the ring of times: 0 night, 1 sunrise, 2 morning, 3 midday, 4 golden hour, 5 sunset, 6 night again.
  // alt: the sun's height in degrees, hourAngle: below 0 before noon. Morning and golden hour sit at 35 percent of the
  // day's highest sun, midday at 85 percent, so a short winter day still walks through all six.
  function phaseFromSun(alt, hourAngle, amax) {
    var a1 = Math.max(6, 0.35 * amax), a2 = Math.max(a1 + 3, 0.85 * amax), am = hourAngle < 0;
    if (alt <= -8) return am ? 0 : 6;
    if (alt < 0) return am ? 1 + alt / 8 : 5 - alt / 8;
    if (alt < a1) return am ? 1 + alt / a1 : 5 - alt / a1;
    if (alt < a2) return am ? 2 + (alt - a1) / (a2 - a1) : 4 - (alt - a1) / (a2 - a1);
    return 3;
  }

  // With no place set: the clock's hour walks the same ring.
  function phaseFromHour(h) {
    var pts = [[0, 0], [5, 0], [6.5, 1], [9, 2], [13, 3], [17, 4], [19, 5], [21, 6], [24, 6]];
    for (var i = 1; i < pts.length; i++) {
      if (h <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (h - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    }
    return 6;
  }

  // The two pictures on either side of the phase, and how much of the second shows (0 to 1). smooth off: the nearest one.
  function pairFor(phase, smooth) {
    phase = Math.max(0, Math.min(6, phase));
    if (!smooth) return { a: Math.round(phase) % 6, b: -1, p: 0 };
    var k = Math.min(5, Math.floor(phase));
    return { a: k, b: (k + 1) % 6, p: phase - k };
  }

  // A small seeded generator (so the "random" order is the same on every start and every screen).
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(n, round) {
    var list = [], i, j, r = mulberry(round * 2654435761 + 12345), t;
    for (i = 0; i < n; i++) list.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  // Which of the n places is up at this time. Nothing is remembered: the answer comes from the clock alone, so a restart or a
  // power cut changes nothing. every: seconds a place stays (0 = never changes). Random: one shuffle per round of n places,
  // and the first place of a round is never the last of the one before.
  function pickIndex(n, nowMs, every, random, epochMs) {
    if (n <= 1 || !every) return 0;
    var slot = Math.max(0, Math.floor((nowMs - epochMs) / (every * 1000)));
    if (!random || n === 2) return slot % n;   // two places can only take turns
    var round = Math.floor(slot / n), perm = shuffled(n, round), t;
    // (a swap only touches the first two places, so the last place of the round before is always its shuffle's last)
    if (round > 0 && perm[0] === shuffled(n, round - 1)[n - 1]) { t = perm[0]; perm[0] = perm[1]; perm[1] = t; }
    return perm[slot % n];
  }

  // The file of a picture: backgrounds/places/<place>/<weather>-<time>
  function file(place, weather, time) { return "places/" + place + "/" + weather + "-" + time; }

  // Day preview: a day runs in secsPerDay seconds from the moment it was started.
  function previewDate(nowMs, startMs, startVirtualMs, secsPerDay) {
    return new Date(startVirtualMs + (nowMs - startMs) * (86400 / secsPerDay));
  }

  var API = { TIMES: TIMES, WEATHERS: WEATHERS, weatherSet: weatherSet, maxAltitude: maxAltitude, phaseFromSun: phaseFromSun,
    phaseFromHour: phaseFromHour, pairFor: pairFor, pickIndex: pickIndex, file: file, previewDate: previewDate };
  root.Places = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
