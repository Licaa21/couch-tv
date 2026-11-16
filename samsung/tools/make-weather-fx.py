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
    im = Image.new("RGBA", (W * SS, H * SS), (230, 240, 255, 0))   # not black: a blur would darken the edges
    d = ImageDraw.Draw(im)
    draw_fn(d)
    return im.resize((W, H), Image.LANCZOS)


def wrapped(x, y, r):
    """The copies of something at (x, y), up to r wide, that overlap the tile's edges, so it wraps."""
    for dx in (-W, 0, W):
        for dy in (-H, 0, H):
            if -r <= x + dx <= W + r and -r <= y + dy <= H + r:
                yield x + dx, y + dy


def blurred(im, radius):
    """A Gaussian blur that wraps round the edges (the tile is laid 3 x 3, blurred, and the middle cut out), so it stays seamless."""
    big = Image.new("RGBA", (W * 3, H * 3), (240, 246, 255, 0))
    for ix in range(3):
        for iy in range(3):
            big.paste(im, (ix * W, iy * H))
    return big.filter(ImageFilter.GaussianBlur(radius)).crop((W, H, 2 * W, 2 * H))


def streaks(d, n, ln, width, alpha, slant, color=(212, 228, 255)):
    """Rain: drops with a bright head and a tail that fades out (so a streak reads as something fast, not a stick)."""
    for _ in range(n):
        x, y, L = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(*ln)
        wd = rng.uniform(*width)
        a0 = alpha * rng.uniform(0.6, 1.0)
        for px, py in wrapped(x, y, L + 40):
            steps = max(4, int(L / 6))
            for k in range(steps):
                t0, t1 = k / steps, (k + 1) / steps
                a = int(255 * a0 * (t1 ** 1.6))   # faint at the top (the tail), bright at the bottom (the head)
                d.line([((px - L * slant * (1 - t0)) * SS, (py - L * (1 - t0)) * SS), ((px - L * slant * (1 - t1)) * SS, (py - L * (1 - t1)) * SS)],
                       fill=color + (a,), width=max(1, int(wd * SS)))


def rain_far():
    """Far and middle rain in one tile: many fine, short, faint streaks, and fewer medium ones."""
    def f(d):
        streaks(d, 520, (26, 58), (1.0, 1.5), 0.42, 0.14)
        streaks(d, 130, (70, 130), (1.8, 2.8), 0.5, 0.14)
    tile(f).save(os.path.join(OUT, "rain-far.png"), optimize=True)


def rain_near():
    """Near rain: a few long, wide, out of focus streaks (blurred, as a drop close to the eye is)."""
    big = tile(lambda d: streaks(d, 30, (150, 280), (3.0, 5.2), 0.24, 0.14, (225, 238, 255)))
    blurred(big, 1.8).save(os.path.join(OUT, "rain-near.png"), optimize=True)


def flakes(img, n, rad, alpha, blur):
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(*rad)
        a = int(alpha * rng.uniform(0.7, 1.0) * 255)
        for px, py in wrapped(x, y, r + 8):
            q = r * 1.35   # a faint grey-blue edge under the white, so a flake still shows against a white sky
            d.ellipse([px - q, py - q, px + q, py + q], fill=(150, 168, 196, int(a * 0.2)))
            d.ellipse([px - r, py - r, px + r, py + r], fill=(247, 251, 255, a))


def snow_far():
    """Far and middle snow: many tiny crisp flakes, and some medium ones with a soft edge."""
    a = Image.new("RGBA", (W, H), (240, 246, 255, 0))
    flakes(a, 860, (0.9, 1.8), 0.85, 0)
    b = Image.new("RGBA", (W, H), (240, 246, 255, 0))
    flakes(b, 170, (2.6, 4.6), 0.95, 0)
    Image.alpha_composite(a, blurred(b, 0.9)).save(os.path.join(OUT, "snow-far.png"), optimize=True)


def snow_near():
    """Near snow: soft flakes of middling size, and a few bigger, out of focus ones: close, but not in your face."""
    a = Image.new("RGBA", (W, H), (240, 246, 255, 0))
    flakes(a, 70, (4.5, 9), 0.8, 0)
    c = Image.new("RGBA", (W, H), (240, 246, 255, 0))
    flakes(c, 16, (11, 17), 0.42, 0)
    Image.alpha_composite(blurred(a, 1.7), blurred(c, 4.5)).save(os.path.join(OUT, "snow-near.png"), optimize=True)


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
    rain_far()
    rain_near()
    snow_far()
    snow_near()
    fog("fog.png")
    for f in sorted(os.listdir(OUT)):
        print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1024), "KB")
