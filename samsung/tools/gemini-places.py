"""Prompts for the other places, built from the volcano ones in gemini-helper.py (same method, same lessons).

    python samsung/tools/gemini-places.py <place>        # prints the 30 prompt keys

PLACES holds, per place, the original photo and what is in it. jobs(place) returns {key: prompt} for the 30 photos
(<weather>-<time>); SNOWNOTE and DARKNOTE are the two edit notes (dark and snow are edited from one reference photo so the clouds and the snow
cover are the same in every time of day). Used by new-scenes/pipeline (scratch script, not part of the app).
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("gh", os.path.join(HERE, "gemini-helper.py"))
H = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(H)

PLACES = {
    "lake": dict(
        src="2-lake.jpg",
        water_y=0.535,
        geom="every mountain, ridge, tree, rock, the shoreline, the waterline and every underwater rock and plant",
        desc="a split-level photo: the upper half is an alpine valley with snow-capped mountains, green slopes, pines and a winding stream; "
             "the lower half is crystal-clear turquoise water over mossy rocks, cut by the waterline. Keep the waterline exactly where it is. "
             "The water surface and the underwater scene take the light and colour of the time of day (the underwater part is lit from above "
             "by the sky: bright turquoise by day, dim dark teal at dusk, nearly black at night).",
        snow="Snow covers only the land above the water; the water stays clear, unfrozen and dark, and the underwater part does not change.",
    ),
    "dawn-forest": dict(
        src="3-dawn-forest.jpg",
        geom="every hill, ridge, tree line, palm and tree",
        desc="a view over tropical rainforest hills: rolling forested hills fading into the distance, pockets of mist in the valleys, "
             "dark green trees and a few palms in the foreground.",
        snow="",
    ),
    "fog-pines": dict(
        src="4-fog-pines.jpg",
        geom="every hill, ridge and every pine",
        desc="a view over misty pine-forested hills: dark green conifers in the foreground, layered hills fading into valley fog.",
        snow="",
    ),
    "night-lake": dict(
        src="5-night-lake.jpg",
        geom="the rocky peak, every ridge, every pine, both shorelines, every rock and the outline of the lake",
        desc="a still alpine lake with a rocky peak in the middle distance and dark pine forest on both shores; the peak, the trees and "
             "the sky are mirrored in the water; rocks and grass in the foreground. The water always reflects the current sky.",
        snow="Snow covers only the land and the rocks; the lake stays clear, unfrozen and dark.",
    ),
}

TIMES = {
    "night": "DEEP NIGHT, the middle of the night, moonless. It must look like REAL night, not evening or dusk: the whole picture is VERY DARK, average brightness about 5 percent of maximum. The sky is deep black-blue, only slightly lighter (dark navy) near the horizon, with no orange, pink, purple or warm glow anywhere. Mountains, hills, trees and rocks are near-black silhouettes, separated only by a very faint cool blue edge light (10 percent brightness at most). Any mist is barely visible, a dim blue-grey, and any water is a near-black mirror. Overall grade: black and deep navy, very low brightness, very low contrast, no colour except cold dark blue.",
    "sunrise": "SUNRISE, the sun just below the horizon outside the frame on the LEFT (the light comes from the left side of the picture), the sky glowing brightest at the left horizon. Soft pink, peach and pale orange near the horizon fading to cool blue-violet higher up. Light is low, soft and warm-pink on the highest ground facing left, the rest of the landscape a cool mauve; vegetation still dark, deep blue-green, only the highest tops catching pink; thin pale pink-gold mist lies in every valley; distant ridges layered violet-blue; any water reflects the pink and violet sky. Overall grade: gentle, pastel, cool shadows with warm pink highlights, misty.",
    "morning": "MORNING, about two hours after sunrise, the sun low on the left outside the frame. Fresh, clear, slightly cool-white light with a faint warm tint. Long soft shadows falling to the right; rock and slopes warm and clearly detailed, vegetation fresh green with yellow-green highlights and dark blue-green shadows, a thin silver mist still lying in the valleys; distant ridges pale blue-grey; any water reflects the clear pale-blue sky. Overall grade: bright, fresh, clean, slightly cool.",
    "midday": "MIDDAY, the sun high, outside the frame above the viewer. Bright neutral-white light, strong but even; shadows short and hard-edged, rock and slopes evenly lit with strong detail and no glow, vegetation a saturated vivid mid-green, no mist (only a faint haze), distant ridges a clear pale blue; any water a clear blue-green reflecting the sky. Overall grade: bright, high clarity, saturated, slightly high contrast.",
    "golden": "GOLDEN HOUR, about one hour before sunset, the sun low on the RIGHT outside the frame (the light comes from the right side of the picture, never from the left). Warm gold light, long soft shadows falling toward the left, the brightest warm glow of the sky at the right horizon. Slopes and rock facing right glow warm amber-gold with deep brown-violet shadows; vegetation is lit gold on the tops and dark green below; a thin golden haze lies in the valleys; distant ridges are layered soft orange-blue; any water reflects the warm gold sky. Overall grade: rich, warm gold, soft contrast, glowing.",
    "sunset": "SUNSET, the sun just touching the horizon outside the frame on the RIGHT (sunset is on the opposite side from sunrise: the light comes from the right side of the picture, never from the left). The brightest deep orange, red and magenta glow is at the right horizon, fading across the sky to purple and dark blue at the top and on the left. The light is very low and red-orange: slopes and rock facing right glow deep red-orange and the left sides are dark purple; vegetation is nearly silhouette, dark green-black with orange rim light on the very tops; any mist glows pink-orange; distant ridges are layered purple; any water reflects the red-orange and purple sky. Overall grade: dramatic, saturated warm reds and oranges with deep violet shadows.",
}

_GENERIC = [
    ("above the volcano's peak", "above the highest ground"),
    ("on the volcano, in the mist or on the jungle", "on the land, in the mist, on the vegetation or on the water"),
    ("not on the volcano, not in the mist, not on the jungle", "not on the land, not in the mist, not on the vegetation, not on the water"),
    ("not in the sky, not on the volcano, not in the mist, not on the jungle", "not in the sky, not on the land, not in the mist, not on the vegetation, not on the water"),
    ("the volcano and jungle", "the mountains, hills and vegetation"),
    ("the volcano and the jungle", "the mountains, hills and vegetation"),
    ("behind the volcano", "behind the mountains"),
]


def _g(s):
    for a, b in _GENERIC:
        s = s.replace(a, b)
    return s


WEATHER = {
    "clear": _g(H.WEATHER["clear"]),
    "partly": _g(H.WEATHER["partly"]),
    "cloudy": _g(H.WEATHER["cloudy"]),
    "dark": _g(H.WEATHER["dark"].split(" The volcano is a cold grey-brown")[0]) +
            " The land is a cold grey with thin grey mist on its flanks, the vegetation deep blue-green with a wet shine and wind-bent branches, thick grey mist in the valleys, any water dark slate-grey with small wind ripples reflecting the dark clouds. No rain streaks, no rain curtains and no lightning bolts. The time of day is shown ONLY by the overall brightness and a faint dull tint (given below), never by a sun or a coloured light.",
    "snow": _g(H.WEATHER["snow"]).replace(
        "The volcano's upper half is white with snow, every palm, tree and leaf of the jungle is covered in thick white snow resting on the branches and the tops, the trunks and the shadowed undersides stay dark, the far hills are white with dark tree lines, the valley mist is thin and white.",
        "The upper slopes and ridges are white with snow, every tree, shrub and rock is covered in thick white snow resting on the branches and the tops, the trunks and the shadowed undersides stay dark, the far hills are white with dark tree lines, any valley mist is thin and white."),
}
BRIGHT = {w: {t: _g(s.replace("volcano and jungle", "mountains and vegetation").replace("trees black", "trees black"))
              for t, s in d.items()} for w, d in H.BRIGHT.items()}

SNOWNOTE = ("IMPORTANT: the attached photo has the correct snow cover and the correct geometry (mountains, hills, trees, framing). "
            "Keep EXACTLY the same snow, the same trees, the same shapes and the same framing. Change ONLY the sky and the lighting as "
            "described below: the sky must become a thick overcast layer of white-grey snow clouds, with no clear sky and no sun lighting.\n\n")
DARKNOTE = ("IMPORTANT: the attached photo already has the correct storm clouds, correct geometry and NO sun lighting. Keep EXACTLY the same "
            "clouds, the same shapes and the same framing, with the dark cloud layer continuing all the way down to the far hills. Change "
            "ONLY the overall brightness to what is described below, with no pink, orange, violet or pale light anywhere, not even a thin "
            "strip above the hills.\n\n")


def time_text(w, t):
    return BRIGHT[w][t] if w in BRIGHT else TIMES[t]


def jobs(place):
    p = PLACES[place]
    common = H.COMMON.replace("the volcano, every hill, ridge, tree line and palm", p["geom"])
    common = common.replace("(volcano, jungle, valley mist, far hills, sky)", "(the land, the vegetation, any mist or water, the far hills, the sky)")
    assert p["geom"] in common
    out = {}
    for w in WEATHER:
        for t in TIMES:
            wtxt = WEATHER[w] + ((" " + p["snow"]) if w == "snow" and p["snow"] else "")
            out["%s-%s" % (w, t)] = "%s\n\nTHE PLACE: %s\n\nTIME OF DAY: %s\n\nWEATHER: %s" % (common, p["desc"], time_text(w, t), wtxt)
    for k, v in out.items():
        low = v.lower()
        assert "volcano" not in low and "jungle" not in low, k
    return out


if __name__ == "__main__":
    j = jobs(sys.argv[1])
    print(len(j), "prompts")
    print(j["dark-sunset"])
