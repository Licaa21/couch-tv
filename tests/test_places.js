// The places: which place is up, and where the sun is on the ring of times of day (tv-home/web/places.js).
const assert = require("assert");
const P = require("../tv-home/web/places.js");

// the page's own sun formula (app.js solarAltitude), copied so the test needs no page
function solarAltitude(lat, lon, d) {
  var start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0)), dayOfYear = Math.floor((d - start) / 86400000);
  var b = (360 / 365.25) * (dayOfYear - 81) * (Math.PI / 180);
  var eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b), decl = 23.45 * Math.sin(b) * (Math.PI / 180);
  var utc = d.getUTCHours() + d.getUTCMinutes() / 60, st = (utc + lon / 15 + eot / 60 + 24) % 24, ha = (st - 12) * 15 * (Math.PI / 180), la = lat * Math.PI / 180;
  var alt = Math.asin(Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha)))) * 180 / Math.PI;
  return { alt: alt, hourAngle: ha * 180 / Math.PI };
}

// weather -> picture set
assert.strictEqual(P.weatherSet("clear"), "clear");
assert.strictEqual(P.weatherSet("mostly"), "clear");
assert.strictEqual(P.weatherSet(""), "clear");
assert.strictEqual(P.weatherSet("partly"), "partly");
["cloudy", "fog", "drizzle"].forEach(k => assert.strictEqual(P.weatherSet(k), "cloudy", k));
["rain", "storm"].forEach(k => assert.strictEqual(P.weatherSet(k), "dark", k));
assert.strictEqual(P.weatherSet("snow"), "snow");

// the ring of times over a whole day: stays in 0..6, walks forward in the morning and afternoon, never jumps
[[44.4, 26.1, 2026, 5, 21], [44.4, 26.1, 2026, 11, 21], [44.4, 26.1, 2026, 2, 20], [-33.9, 151.2, 2026, 5, 21], [69.6, 19, 2026, 5, 21], [69.6, 19, 2026, 11, 21]].forEach(([lat, lon, y, mo, da]) => {
  const N = Math.floor((Date.UTC(y, mo - 1, da) - Date.UTC(y, 0, 0)) / 86400000), amax = P.maxAltitude(lat, N);
  let prev = null, maxPhase = 0, seenNight = false;
  for (let m = 0; m < 1440; m += 5) {
    const d = new Date(Date.UTC(y, mo - 1, da, 0, m)), s = solarAltitude(lat, lon, d), ph = P.phaseFromSun(s.alt, s.hourAngle, amax);
    assert(ph >= 0 && ph <= 6, "phase in range " + ph);
    if (prev !== null && Math.abs(lat) < 60) {   // (under a midnight sun the sun skims the horizon and flips from sunset to sunrise in one step: no smoothing possible)
      const step = Math.abs(ph - prev);
      assert(step < 0.9 || step > 5.1, "no jump of " + step.toFixed(2) + " at " + [lat, mo, m]);   // 6 and 0 are the same night
    }
    if (s.alt < -9) seenNight = true;
    maxPhase = Math.max(maxPhase, ph);
    prev = ph;
  }
  // the pair for the phase never names a picture that does not exist
  for (let ph = 0; ph <= 6; ph += 0.25) { const pr = P.pairFor(ph, true); assert(pr.a >= 0 && pr.a < 6 && pr.b >= 0 && pr.b < 6 && pr.p >= 0 && pr.p <= 1); }
});
// a clear summer day at 44N reaches midday (3); at noon in winter the sun is lower but still gets past morning
{
  const amaxSummer = P.maxAltitude(44.4, 172), amaxWinter = P.maxAltitude(44.4, 355);
  assert.strictEqual(P.phaseFromSun(amaxSummer, 0, amaxSummer), 3);
  assert.strictEqual(P.phaseFromSun(amaxWinter, 0, amaxWinter), 3);
  assert.strictEqual(P.phaseFromSun(-20, -50, 60), 0);
  assert.strictEqual(P.phaseFromSun(-20, 50, 60), 6);
  assert.strictEqual(P.phaseFromSun(0, -80, 60), 1);   // the sun on the horizon in the morning is sunrise
  assert.strictEqual(P.phaseFromSun(0, 80, 60), 5);    // and in the evening sunset
}
// the order of the six: morning side rises 0 -> 3, afternoon side goes on 3 -> 6
{
  let last = -1;
  for (let alt = -10; alt <= 60; alt += 1) { const ph = P.phaseFromSun(alt, -30, 60); assert(ph >= last - 1e-9, "morning rises"); last = ph; }
  last = 99;
  for (let alt = 60; alt >= -10; alt -= 1) { const ph = P.phaseFromSun(alt, 30, 60); assert(ph >= (last === 99 ? 0 : last) - 1e-9 || last === 99, "afternoon rises"); last = ph; }
}
// hour fallback walks the same ring
assert.strictEqual(P.phaseFromHour(3), 0);
assert.strictEqual(P.phaseFromHour(13), 3);
assert.strictEqual(P.phaseFromHour(23), 6);
for (let h = 0; h < 24; h += 0.25) assert(P.phaseFromHour(h + 0.25) >= P.phaseFromHour(h) - 1e-9);
// smooth off: the nearest picture only
assert.deepStrictEqual(P.pairFor(2.4, false), { a: 2, b: -1, p: 0 });
assert.deepStrictEqual(P.pairFor(2.6, false), { a: 3, b: -1, p: 0 });
assert.deepStrictEqual(P.pairFor(6, false), { a: 0, b: -1, p: 0 });
assert.strictEqual(P.pairFor(5.5, true).b, 0);   // sunset leads back to night

// which place: nothing is remembered, the clock alone decides
const epoch = new Date(2024, 0, 1).getTime();
for (const n of [3, 5]) {
  for (const every of [60, 300, 3600, 86400]) {
    const same = (t) => P.pickIndex(n, t, every, true, epoch);
    let lastPick = -1, firstOfRound = {}, seen = {};
    for (let slot = 1000; slot < 1000 + n * 400; slot++) {
      const t = epoch + slot * every * 1000 + 17;
      const a = same(t), b = same(t);
      assert.strictEqual(a, b, "same clock, same place (a restart changes nothing)");
      assert(a >= 0 && a < n);
      if (lastPick >= 0) assert.notStrictEqual(a, lastPick, "random never repeats the place just shown, n=" + n);
      lastPick = a;
      const round = Math.floor(slot / n); seen[round] = seen[round] || {}; seen[round][a] = 1;
    }
    Object.keys(seen).slice(1, -1).forEach(r => assert.strictEqual(Object.keys(seen[r]).length, n, "every place shows once a round"));
  }
}
assert.strictEqual(P.pickIndex(5, epoch + 3 * 3600 * 1000, 3600, false, epoch), 3, "in order: the fourth hour is the fourth place");
assert.strictEqual(P.pickIndex(5, epoch + 7 * 3600 * 1000, 3600, false, epoch), 2, "and it wraps round");
assert.strictEqual(P.pickIndex(4, epoch + 99999999, 0, true, epoch), 0, "never changing: the first place stays");
assert.strictEqual(P.pickIndex(1, epoch + 99999999, 60, true, epoch), 0);
assert.strictEqual(P.pickIndex(2, epoch + 61000, 60, true, epoch), 1, "two places take turns");
// a place that has not got to its first slot yet
assert.strictEqual(P.pickIndex(3, epoch - 5000, 60, false, epoch), 0);

// files and the day preview
assert.strictEqual(P.file("water", "dark", "sunset"), "places/water/dark-sunset");
const v = P.previewDate(1000 * 60, 0, Date.UTC(2026, 4, 21, 0), 120);   // a day in 2 minutes: after a minute it is noon
assert.strictEqual(v.getUTCHours(), 12);
console.log("places tests passed");
