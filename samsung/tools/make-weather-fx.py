"""Makes the rain, snow and fog tiles for the Samsung app: tv-home/web/backgrounds/fx/*.png.

    python samsung/tools/make-weather-fx.py

The weather effects are not drawn frame by frame: each one is a transparent picture that tiles without a seam, and the page only slides
it (a CSS animation on its own layer, which the TV's graphics chip does without the processor). Rain and snow: a far and a near layer
(small and faint, big and bright), 1920x1080, the pattern wraps round every edge so the slide has no jump. Fog: soft clouds, 960x540,
wrapping sideways. Needs Pillow and numpy. Random, but seeded: the same files every time.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tv-home", "web", "backgrounds", "fx")
W, H, SS = 1920, 1080, 2   # tile size, and supersampling for smooth edges
rng = np.random.default_rng(11)


def tile(draw_fn):
    im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    draw_fn(d)
    return im.resize((W, H), Image.LANCZOS)


def wrapped(x, y, r):
    """The copies of something at (x, y), up to r wide, that overlap the tile's edges, so it wraps."""
    for dx in (-W, 0, W):
        for dy in (-H, 0, H):
            if -r <= x + dx <= W + r and -r <= y + dy <= H + r:
                yield x + dx, y + dy


def rain(n, ln, width, alpha, name):
    slant = 0.16
    def f(d):
        for _ in range(n):
            x, y, L = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(*ln)
            a = int(alpha * rng.uniform(0.7, 1.0) * 255)
            for px, py in wrapped(x, y, L + 40):
                d.line([(px * SS, py * SS), ((px - L * slant) * SS, (py - L) * SS)], fill=(205, 225, 255, a), width=max(1, int(width * SS)))
    tile(f).save(os.path.join(OUT, name), optimize=True)


def snow(n, rad, alpha, blur, name):
    big = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    for _ in range(n):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(*rad)
        a = int(alpha * rng.uniform(0.75, 1.0) * 255)
        for px, py in wrapped(x, y, r + 8):
            d.ellipse([px - r, py - r, px + r, py + r], fill=(246, 250, 255, a))
    big.filter(ImageFilter.GaussianBlur(blur)).save(os.path.join(OUT, name), optimize=True)


def fog(name):
    """Soft clouds that wrap on every edge: noise filtered in the frequency domain is periodic by construction."""
    w, h = 960, 540
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    r2 = fx * fx + fy * fy
    acc = np.zeros((h, w), np.float32)
    for sigma, weight in ((0.012, 0.55), (0.025, 0.30), (0.05, 0.15)):
        noise = rng.standard_normal((h, w))
        f = np.fft.fft2(noise) * np.exp(-r2 / (2 * sigma * sigma))
        n = np.real(np.fft.ifft2(f)).astype(np.float32)
        acc += weight * (n - n.mean()) / (n.std() + 1e-6)
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    a = np.clip((acc - 0.42) * 2.4, 0, 1) * 0.34
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 225, 232, 240
    rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba).save(os.path.join(OUT, name), optimize=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    rain(170, (18, 34), 1.2, 0.48, "rain-far.png")
    rain(44, (60, 100), 2.2, 0.72, "rain-near.png")
    snow(200, (1.1, 2.0), 0.65, 0.5, "snow-far.png")
    snow(46, (3.0, 5.4), 0.92, 1.0, "snow-near.png")
    fog("fog.png")
    for f in sorted(os.listdir(OUT)):
        print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1024), "KB")
