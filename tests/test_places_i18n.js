// every English string has a Romanian one with the same {placeholders}, and the places' strings exist (CLAUDE.local.md, Romanian rule)
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "..", "tv-home", "web", "i18n.js"), "utf8")
  .replace("  window.I18N = {", "  window.__S = S;\n  window.I18N = {");
const sb = { window: {}, navigator: { language: "en" }, document: { documentElement: {} }, localStorage: { getItem() { return null; }, setItem() {} }, location: { search: "" } };
sb.window = sb; vm.createContext(sb); vm.runInContext(src, sb);
const S = sb.__S;
const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
const skip = /^(err_|note_)/;   // the bridge's words stay English on purpose (CLAUDE.local.md)
const bad = [];
Object.keys(S.en).forEach(k => {
  if (skip.test(k)) return;
  if (!(k in S.ro)) bad.push("missing ro: " + k);
  else if (ph(S.en[k]) !== ph(S.ro[k])) bad.push("placeholders differ: " + k);
});
const mine = ["place_every", "place_every_sub", "place_never", "dur_min", "dur_hour", "dur_day", "place_order", "place_in_order", "place_random", "place_fx", "place_fx_sub",
  "place_fx_black", "place_fx_dissolve", "fixed_time", "fixed_weather", "smooth_time", "smooth_time_sub", "wx_dissolve", "wx_dissolve_sub", "day_preview", "day_preview_sub", "day_preview_n"]
  .concat(["night", "sunrise", "morning", "midday", "golden", "sunset"].map(k => "tod_" + k), ["clear", "partly", "cloudy", "dark", "snow"].map(k => "wxs_" + k));
mine.forEach(k => { assert(S.en[k], "en " + k); assert(S.ro[k], "ro " + k); });
assert.deepStrictEqual(bad, [], bad.slice(0, 10).join("\n"));
console.log("i18n ok:", Object.keys(S.en).length, "english keys, romanian complete");
