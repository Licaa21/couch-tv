# Places: five photo places with 30 variations each (design)

Fork-only (Samsung app, no computer). Size of the work: a project.

## Intent
The home should feel alive: the picture follows the real sun and weather without ever visibly "switching", and the place
itself changes on a timer. Today there are 12 separate scenes (5 places and 7 weather copies) that swap with a fixed 1.6 s
fade every 5 to 20 s. We replace them with **5 places x 30 variations** (5 weathers x 6 times of day), generated with Gemini
(new-scenes/<place>-4k, 3840x2160, same framing in all 30 of a place).

## Goals
- Pick which places take part, and how often the place changes (1 min to 2 days, or never).
- Time of day drifts continuously with the sun; weather changes dissolve slowly; a place change dips through black.
- Every visible string English + Romanian (rule in CLAUDE.local.md); nothing personal baked into the wgt.
- Install stays small: about 80 MB (1080p only; no @2x copies for places).

## Non-goals / anti-goals
- No rain, snow or lightning in the photos: the existing ambient-weather canvas draws them (off by default; Lighter home keeps it off).
- No moving clouds and no zoom or pan of the photo (the glass clock fill is aligned to the photo; a transform would break it).
- No phone remote, bridge or computer. A change that stalls a slow TV, or that fires while someone browses the rows, is a failure.

## Constraints
- Tizen 6, weak chip: at most 3 full-screen photo layers drawn at once, opacity only (no filters), updates at most once a minute.
- Each variation needs its own glass fill (`-glass.jpg`) and foreground cut-out (`-fg.webp`, the base scene's alpha, registered with
  `register()` in samsung/tools/make-weather-scenes.py). The clock/date position of a place is its base scene's css (`look`).
- Stateless: nothing is stored about "where we are"; everything is computed from the clock, so a restart or power cut changes nothing.

## Approaches considered (transitions)
1. **A fixed fade at every change** (today): simple, but each change is visible as a switch. Rejected.
2. **Continuous drift for time of day, slow dissolve for weather, dip to black for places** (chosen by Lica): the framing is identical across
   variations, so dissolves read as light changing in place; black hides loading and the jump between two different landscapes.
3. A canvas or shader that animates clouds: too heavy for the TV and needs cut-out layers. Rejected.

## Design
**Data.** The five places keep the ids `golden` (volcano), `water` (lake), `dawn` (dawn forest), `fog` (pine fog), `night` (night lake), so the existing
Home settings checklist (`scene_order`, `scenes_off`, thumbnails, move up/down) keeps working. The 7 weather scenes and the old 5 single photos are removed.
Files: `backgrounds/places/<id>/<weather>-<time>.jpg`, `...-glass.jpg`, `...-fg.webp`, plus `thumb.jpg`. Weathers: clear, partly, cloudy, dark, snow.
Times: night, sunrise, morning, midday, golden, sunset. Own photos (Home settings, Your photos) and `my_scenes` stay as ordinary single-picture entries in the same rotation.

**Which place (stateless).** `slot = floor((now - 2024-01-01) / every)`. In order: `list[slot % n]`. Random: one permutation of the list per round
(`round = floor(slot / n)`, seeded by `round`), and the first of a round is swapped if it equals the last of the previous round (no immediate repeat).
Checked every 30 s and whenever the clock ticks; it waits while someone is browsing (existing `sceneMayChange`). Never = the first selected place stays.

**Which variation.** Weather kind (existing `weatherKind`): clear and mostly clear -> clear, partly -> partly, cloudy, fog and drizzle -> cloudy,
rain, storm -> dark (lightning from the overlay), snow -> snow; unknown -> clear. Time of day from `solarAltitude`, normalised by the day's maximum
altitude `amax`: keyframes on the morning side night(-8 deg) -> sunrise(0) -> morning(0.35 amax, at least 6 deg) -> midday(0.85 amax or more); on the
afternoon side midday -> golden(0.35 amax) -> sunset(0) -> night(-8). The two neighbouring keyframes and the fraction `p` between them come
from the current altitude and side. Without a place for the weather: the clock's hour decides (existing fallback).

**Rendering.** Per place: layer A (full opacity) is the lower keyframe, layer B sits over it at opacity `p` (set every 60 s with a 60 s linear
CSS transition so it moves smoothly; Lighter home: every 120 s). Each layer is a scene element exactly like today's (photo, shade, glass clock, cut-out),
so the clock fill dissolves with the picture; same clock position means no ghosting. A weather change loads the new variation as a third layer and
dissolves it in over the chosen time (15/30/60 s), then it becomes layer A. A place change: the whole scenes box fades to black (1.2 s), the layers are
swapped while black, and fades back in (1.2 s); the date's existing `swap` fade follows. Only current, next and the incoming layer are decoded.

**Settings** (Home settings, Scenes; keys in `ST`, reload keys updated):
- Places: tick, reorder (existing; at least one stays on).
- Change place every: 1, 5, 10, 15, 30 min, 1, 2, 6, 12, 24 h, 2 days, Never. Default 1 hour. (`place_every`, seconds)
- Place order: In order / Random (`place_random`).
- Place change effect: Fade through black / Dissolve (`place_fx`). Default black.
- Follow the sun and the weather (existing `sun_sync`, default on). When off: Time of day (auto is on; fixed: night ... sunset) and Weather
  (clear, partly, cloudy, dark, snow) (`fixed_time`, `fixed_weather`).
- Smooth time of day: on / off (off = hold one keyframe, dissolve at the midpoint) (`smooth_time`).
- Weather change takes: 15 / 30 / 60 s (`wx_dissolve`, default 30).
- Day preview: Off / 1 / 3 / 10 min per day: runs the sun fast to check the transitions; not saved, off after a restart.
- Weather effects: the existing overlay toggle stays; it is off with Lighter home.

## Assets (build step, not app code)
`samsung/tools/make-place-scenes.py`: from new-scenes/<place>-4k to `tv-home/web/backgrounds/places/<id>/`: 1920x1080 JPEG q86, glass copy, fg webp from the
base scene's alpha, a thumbnail. Run once before removing the old scene files (their cut-outs are the alpha source). `samsung/build.py` packs `places/`
and no `@2x` for them. Credits: the Gemini photos are generated from the upstream originals (backgrounds/CREDITS.md note).

## Left to the builder
Exact easing curves, the layer pool's internals, thumbnail framing, css for the black overlay, the strings' wording (English + Romanian).

## Checks
Node tests (extend the old pick-test): stateless place pick (in order, random, no repeat, after a restart), keyframe pair and `p` (monotonic over a day, a short winter
day, polar fallback), variation names exist as files; i18n key parity en/ro; Playwright screenshots at 1920x1080 of a place, a drift mid-point, a weather dissolve and
the black dip; build, unzip and scan the wgt for personal data; code review before commit. Release number is Lica's call (0.14.0 suggested: a feature, not a fix).
