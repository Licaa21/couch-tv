"""Makes tv-home/web/backgrounds/places/<id>/mask.png for the places with scenery in front of the clock.

    python samsung/tools/make-place-masks.py <folder with golden.webp, dawn.webp, fog.webp, night.webp>

The folder holds the old scenes' cut-outs (git show c864445^:tv-home/web/backgrounds/scene-<id>-fg.webp). The mask is the opposite of the
cut-out: opaque where the sky is, see-through where the scenery is, with a soft edge. The app lays it over the clock (-webkit-mask-image), so
the digits go behind the mountain without a second copy of every picture drawn over the first. Needs Pillow and numpy.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for pid in ("golden", "dawn", "fog", "night"):
    a = Image.open(os.path.join(sys.argv[1], pid + ".webp")).convert("RGBA").split()[3].resize((1920, 1080), Image.LANCZOS)
    a = a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))   # the scenery grown by 2px, then a soft edge: no hard line where the digits end
    sky = 255 - np.asarray(a, np.uint8)
    out = Image.new("LA", (1920, 1080), 0)
    out.putalpha(Image.fromarray(sky))
    p = os.path.join(ROOT, "tv-home", "web", "backgrounds", "places", pid, "mask.png")
    out.save(p, optimize=True)
    print(pid, os.path.getsize(p) // 1024, "KB")
