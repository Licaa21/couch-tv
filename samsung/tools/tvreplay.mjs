// Draws what the TV's app would show, from the state tvdebug.py read from the TV: the same app build, the same settings, the same moment (and time zone),
// the same weather, in a browser on this computer, and saves a screenshot. It is the app's own drawing (the TV's graphics chip is not involved), so it
// shows what the app is told to draw: layout, pictures, fades, colours; not how fast the TV does it.
//
//   node samsung/tools/tvreplay.mjs state.json out.png
//
// Needs playwright-core (NODE_PATH, or run it from a folder that has it) and a Chromium based browser (TVDEBUG_BROWSER, else Brave or Chrome in the usual place).
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "build", "samsung", "app");
const require = createRequire(import.meta.url);
let chromium;
try { chromium = require("playwright-core").chromium; } catch (e) { chromium = require(path.join(process.env.NODE_PATH || ".", "playwright-core")).chromium; }
const [stateFile, out] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const browserPath = process.env.TVDEBUG_BROWSER || ["C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;

const [w, h, dpr] = state.screen || [1920, 1080, 1];
const b = await chromium.launch({ executablePath: browserPath, headless: true });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: state.tzName || undefined });
await ctx.addInitScript((a) => {
  const D = Date, off = a.now - D.now();
  class FD extends D { constructor(...x) { if (x.length === 0) super(D.now() + off); else super(...x); } static now() { return D.now() + off; } }
  window.Date = FD;
  try { localStorage.setItem("tvhome.settings", JSON.stringify({ s: a.settings, updated: Date.now(), pending: false })); } catch (e) {}
}, { now: state.now, settings: state.settings || {} });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/index.html?offline=1&alone=1`);
await page.waitForTimeout(6500);
const code = state.weather && state.weather.shown && state.weather.shown.code;
if (code != null && state.weather.test === 0) await page.evaluate((c) => window.tv.testWeather(c), code);   // the weather the TV shows
else if (state.weather && state.weather.test) await page.evaluate((c) => window.tv.testWeather(c), state.weather.test);
await page.waitForTimeout(state.layers && state.layers.B ? 2500 : 9000);   // the pictures dissolve in over a few seconds
await page.screenshot({ path: out });
await b.close(); srv.close();
console.log("saved", path.resolve(out), `${w}x${h}`, "scene", state.scene, "at", new Date(state.now).toISOString());
