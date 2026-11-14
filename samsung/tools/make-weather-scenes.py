"""Makes the weather scenes of the Samsung app from photos edited from the built-in scenes (new-scenes/*.jpg).

    python samsung/tools/make-weather-scenes.py [folder with the edited photos, default new-scenes]

Each edited photo keeps the geometry of its base scene, so the base scene's cut-out (the scenery drawn in front of the clock) is
reused: its transparency is laid over the NEW photo. The photo is first nudged by the few pixels Gemini moved it. Writes, into
tv-home/web/backgrounds, for every scene: scene-<id>.jpg, scene-<id>@2x.jpg, scene-<id>-glass.jpg and (where the base has one)
scene-<id>-fg.webp and scene-<id>-fg@2x.webp. Needs Pillow and numpy.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BG = os.path.join(ROOT, "tv-home", "web", "backgrounds")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "new-scenes")

# id: (edited photo, base scene it was edited from, does the base have a cut-out)
SCENES = {
    "mostlyclear": ("1-mostly-clear.jpg", "scene-golden", True),
    "partly": ("1-partly.jpg", "scene-golden", True),
    "storm": ("2-storm.jpg", "scene-golden", True),
    "lakerain": ("3-lake-rain.jpg", "scene-water", False),
    "junglerain": ("4-jungle-rain.jpg", "scene-dawn", True),
    "snow": ("5-snow.jpg", "scene-fog", True),
    "nightcloudy": ("6-night-cloudy.jpg", "scene-night", True),
}
W2, H2 = 2730, 1536   # the size of the edited photos: the @2x files keep it (nothing is enlarged)


def edges(im, size):
    g = np.asarray(im.convert("L").resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.5)), np.float32)
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1]))
    e = gx + gy
    return e / (np.percentile(e, 99) + 1e-6)


def register(base, new):
    """The (dx, dy), in pixels of the 1920 wide picture, that lays `new` over `base`."""
    sz = (480, 270)
    eb, en = edges(base, sz), edges(new, sz)
    best = (-1, 0, 0)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            a = eb[max(0, dy):270 + min(0, dy), max(0, dx):480 + min(0, dx)]
            b = en[max(0, -dy):270 + min(0, -dy), max(0, -dx):480 + min(0, -dx)]
            s = float((np.minimum(a, 1.2) * np.minimum(b, 1.2)).mean())
            if s > best[0]:
                best = (s, dx, dy)
    return best[1] * 4, best[2] * 4   # back to 1920 wide


def shifted(im, dx, dy):
    """`im` moved by (dx, dy) of its own pixels, the border filled by the edge."""
    if not dx and not dy:
        return im
    w, h = im.size
    pad = Image.new("RGB", (w + 2 * abs(dx), h + 2 * abs(dy)))
    a = np.asarray(im)
    p = np.pad(a, ((abs(dy), abs(dy)), (abs(dx), abs(dx)), (0, 0)), mode="edge")
    pad = Image.fromarray(p)
    return pad.crop((abs(dx) - dx, abs(dy) - dy, abs(dx) - dx + w, abs(dy) - dy + h))


def glass(im):
    """The frosted copy the clock's digits are filled with: blurred and a little brighter (as the built-in scenes' are)."""
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(14)), np.float32) * 1.18 + 4
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def with_alpha(rgb, mask):
    out = rgb.convert("RGBA")
    out.putalpha(mask.split()[3])
    return out


def main():
    for sid, (name, base, has_fg) in SCENES.items():
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            print("missing", path)
            continue
        im = Image.open(path).convert("RGB")
        w, h = im.size
        if abs(w / h - 16 / 9) > 0.002:   # not 16:9: cut the sides evenly
            nw = int(round(h * 16 / 9))
            im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        im2 = im.resize((W2, H2), Image.LANCZOS)
        im1 = im.resize((1920, 1080), Image.LANCZOS)
        base1 = Image.open(os.path.join(BG, base + ".jpg")).convert("RGB")
        dx, dy = register(base1, im1)
        print("%-12s moved by %d,%d px" % (sid, dx, dy))
        im1 = shifted(im1, dx, dy)
        im2 = shifted(im2, int(round(dx * W2 / 1920)), int(round(dy * W2 / 1920)))
        im1.save(os.path.join(BG, "scene-%s.jpg" % sid), quality=90, optimize=True)
        im2.save(os.path.join(BG, "scene-%s@2x.jpg" % sid), quality=86, optimize=True)
        glass(im1).save(os.path.join(BG, "scene-%s-glass.jpg" % sid), quality=88, optimize=True)
        if has_fg:
            m1 = Image.open(os.path.join(BG, base + "-fg.webp")).convert("RGBA")
            m2 = Image.open(os.path.join(BG, base + "-fg@2x.webp")).convert("RGBA").resize((W2, H2), Image.LANCZOS)
            with_alpha(im1, m1).save(os.path.join(BG, "scene-%s-fg.webp" % sid), quality=88, method=4)
            with_alpha(im2, m2).save(os.path.join(BG, "scene-%s-fg@2x.webp" % sid), quality=84, method=4)
    print("done")


if __name__ == "__main__":
    main()
