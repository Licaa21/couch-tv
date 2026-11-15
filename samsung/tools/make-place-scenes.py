"""Makes the five places of the Samsung app (30 pictures each) from the Gemini photos in new-scenes/<folder>-4k/.

    python samsung/tools/make-place-scenes.py [place ids ...]          (default: every place whose folder is there)

For every place and every <weather>-<time> (clear, partly, cloudy, dark, snow x night, sunrise, morning, midday, golden, sunset) it writes,
into tv-home/web/backgrounds/places/<id>/: <weather>-<time>.jpg (1920x1080), -glass.jpg (the frosted copy the clock is filled with,
960x540), and where the place has a cut-out -fg.webp (the scenery in front of the clock). Plus thumb.jpg for Home settings.

The cut-out is the old scene's (the volcano, lake, forest... the app had before places): its transparency is laid over each new picture, after
nudging the picture by the few pixels Gemini moved it (register() as in make-weather-scenes.py). So run this BEFORE the old scene files are
deleted (they were removed when the places came in: `git checkout <earlier commit> -- tv-home/web/backgrounds` brings them back
to run this again). Needs Pillow and numpy.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BG = os.path.join(ROOT, "tv-home", "web", "backgrounds")
NEW = os.path.join(ROOT, "new-scenes")
# id: (folder, the old scene whose cut-out and framing it takes over, does it have a cut-out)
PLACES = {
    "golden": ("volcano", "scene-golden", True),
    "water": ("lake", "scene-water", False),
    "dawn": ("dawn-forest", "scene-dawn", True),
    "fog": ("fog-pines", "scene-fog", True),
    "night": ("night-lake", "scene-night", True),
}
WEATHERS = ["clear", "partly", "cloudy", "dark", "snow"]
TIMES = ["night", "sunrise", "morning", "midday", "golden", "sunset"]


def edges(im, size):
    g = np.asarray(im.convert("L").resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.5)), np.float32)
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1]))
    e = gx + gy
    return e / (np.percentile(e, 99) + 1e-6)


def register(eb, new):
    """The (dx, dy), in pixels of the 1920 wide picture, that lays `new` over the base (eb: the base's edges)."""
    sz = (480, 270)
    en = edges(new, sz)
    best = (-1, 0, 0)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            a = eb[max(0, dy):270 + min(0, dy), max(0, dx):480 + min(0, dx)]
            b = en[max(0, -dy):270 + min(0, -dy), max(0, -dx):480 + min(0, -dx)]
            s = float((np.minimum(a, 1.2) * np.minimum(b, 1.2)).mean())
            if s > best[0]:
                best = (s, dx, dy)
    return best[1] * 4, best[2] * 4


def shifted(im, dx, dy):
    if not dx and not dy:
        return im
    w, h = im.size
    p = np.pad(np.asarray(im), ((abs(dy), abs(dy)), (abs(dx), abs(dx)), (0, 0)), mode="edge")
    return Image.fromarray(p).crop((abs(dx) - dx, abs(dy) - dy, abs(dx) - dx + w, abs(dy) - dy + h))


def glass(im):
    """The frosted copy the clock's digits are filled with: blurred and a little brighter, at half size (it is blurred anyway)."""
    small = im.resize((960, 540), Image.LANCZOS).filter(ImageFilter.GaussianBlur(7))
    a = np.asarray(small, np.float32) * 1.18 + 4
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def make(pid):
    folder, base, has_fg = PLACES[pid]
    src = os.path.join(NEW, folder + "-4k")
    if not os.path.isdir(src):
        print("skip %s: no %s" % (pid, src))
        return
    out = os.path.join(BG, "places", pid)
    os.makedirs(out, exist_ok=True)
    base1 = Image.open(os.path.join(BG, base + ".jpg")).convert("RGB")
    eb = edges(base1, (480, 270))
    mask = Image.open(os.path.join(BG, base + "-fg.webp")).convert("RGBA").split()[3] if has_fg else None
    n = 0
    for w in WEATHERS:
        for t in TIMES:
            path = os.path.join(src, "%s-%s.jpg" % (w, t))
            if not os.path.exists(path):
                print("  missing", path)
                continue
            im = Image.open(path).convert("RGB").resize((1920, 1080), Image.LANCZOS)
            dx, dy = register(eb, im)
            im = shifted(im, dx, dy)
            name = "%s-%s" % (w, t)
            im.save(os.path.join(out, name + ".jpg"), quality=86, optimize=True, progressive=False)
            glass(im).save(os.path.join(out, name + "-glass.jpg"), quality=80, optimize=True)
            if mask is not None:
                rgba = im.convert("RGBA")
                rgba.putalpha(mask)
                rgba.save(os.path.join(out, name + "-fg.webp"), quality=84, method=4)
            if (w, t) == ("clear", "midday"):
                im.resize((480, 270), Image.LANCZOS).save(os.path.join(out, "thumb.jpg"), quality=82, optimize=True)
            n += 1
            if abs(dx) > 16 or abs(dy) > 16:
                print("  %s moved by %d,%d px (large)" % (name, dx, dy))
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out)) / 1e6
    print("%-7s %d pictures, %.1f MB" % (pid, n, size))


if __name__ == "__main__":
    for pid in (sys.argv[1:] or list(PLACES)):
        make(pid)
