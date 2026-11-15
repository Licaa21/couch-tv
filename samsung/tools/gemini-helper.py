"""Walks you through the 30 volcano photos with Gemini: copy, paste, download, nothing else.

    python samsung/tools/gemini-helper.py [--downloads <folder>] [--out <folder>]

It puts the next prompt in the clipboard. In Gemini: new chat, attach new-scenes/originals-4k/1-volcano.jpg, paste (Ctrl+V), send,
download the picture. The script sees the new image in your Downloads folder, moves it to new-scenes/volcano/<weather>-<time>.<ext>
and puts the following prompt in the clipboard. To redo a picture, delete its file from new-scenes/volcano (the script then asks for
it again); Ctrl+C stops it and running it again carries on where it left off. No account, key or personal data is used.
"""
import argparse
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = (".png", ".jpg", ".jpeg", ".webp")

COMMON = """Edit the attached photo (it is the base). This is a photo edit, not a new picture. Re-render the WHOLE photo as if it had been taken at a different moment with different weather, and keep the GEOMETRY identical: same camera position, same lens, same framing, same horizon line at the same height, and the volcano, every hill, ridge, tree line and palm in exactly the same position, shape and size. Do not add, remove, move, crop or zoom anything in the landscape. No people, no animals, no birds, no boats, no buildings, no text, no logos, no watermark. Keep the upper-middle part of the sky (centred horizontally, in the top 45 percent of the picture) smooth and uncluttered, with no bright spot, no bird, no airplane and no strong detail, because a large clock is shown there. The sun or moon is never visible in the picture: it is outside the frame. No falling rain, no falling snow, no snowflakes, no rain streaks and no lightning bolts anywhere in the picture: those moving effects are added later by software, so the picture must be a still landscape without any particles.
THE LIGHT MUST CHANGE, NOT ONLY THE CLOUDS. Re-light every part of the landscape (volcano, jungle, valley mist, far hills, sky) for the time and weather below: direction and strength of the light, colour temperature, contrast, colour of the shadows, haze, how wet or dry surfaces look, the colour of the vegetation and rock. Do not paste clouds into the original sky and leave the old lighting. Output: a photograph, natural, realistic, high detail, no painting or illustration look, 16:9, as large as you can (3840x2160 is best)."""

TIMES = {
    "night": "DEEP NIGHT, the middle of the night, moonless. It must look like REAL night, not evening or dusk: the whole picture is VERY DARK, average brightness about 5 percent of maximum. The sky is deep black-blue, only slightly lighter (dark navy) near the horizon, with no orange, pink, purple or warm glow anywhere. The volcano, the jungle and the hills are near-black silhouettes, separated only by a very faint cool blue edge light (10 percent brightness at most). The valley mist is barely visible, a dim blue-grey. Overall grade: black and deep navy, very low brightness, very low contrast, no colour except cold dark blue.",
    "sunrise": "SUNRISE, the sun just below the horizon outside the frame on the LEFT (the light comes from the left side of the picture), the sky glowing brightest at the left horizon. Soft pink, peach and pale orange near the horizon fading to cool blue-violet higher up. Light is low, soft and warm-pink on the upper slopes of the volcano, the rest of the volcano a cool mauve; the jungle is still dark, deep blue-green with only the highest palm tops catching pink; thick pale pink-gold mist lies in every valley. The far hills are layered violet-blue. Overall grade: gentle, pastel, cool shadows with warm pink highlights, misty.",
    "morning": "MORNING, about two hours after sunrise, the sun low on the left outside the frame. Fresh, clear, slightly cool-white light with a faint warm tint. Long soft shadows on the volcano's left slopes, the volcano a warm tan-brown with visible ridges, the jungle a fresh green with yellow-green highlights on the palms and dark blue-green shadows, a thin silver mist still lying in the valleys. The far hills are pale blue-grey. Overall grade: bright, fresh, clean, slightly cool.",
    "midday": "MIDDAY, the sun high, outside the frame above the viewer. Bright neutral-white light, strong but even; shadows short and hard-edged under the palms, the volcano evenly lit in grey-brown with strong rock detail and no glow, the jungle a saturated vivid mid-green, no valley mist (only a faint haze), the far hills a clear pale blue. Overall grade: bright, high clarity, saturated, slightly high contrast.",
    "golden": "GOLDEN HOUR, about one hour before sunset, the sun low on the RIGHT outside the frame (the light comes from the right side of the picture, never from the left). Warm gold light, long soft shadows falling toward the left, the brightest warm glow of the sky at the right horizon. The volcano glows warm amber-gold on its right-hand slopes with deep brown-violet shadows in the gullies; the jungle is lit gold on the palm tops and dark green below; a thin golden haze lies in the valleys. The far hills are layered soft orange-blue. Overall grade: rich, warm gold, soft contrast, glowing.",
    "sunset": "SUNSET, the sun just touching the horizon outside the frame on the RIGHT (sunset is on the opposite side from sunrise: the light comes from the right side of the picture, never from the left). The brightest deep orange, red and magenta glow is at the right horizon, fading across the sky to purple and dark blue at the top and on the left. Deep orange, red and magenta sky near the horizon, fading to purple and dark blue at the top. The light is very low and red-orange: the volcano's lit slopes glow deep red-orange and its shadowed side is dark purple; the jungle is nearly silhouette, dark green-black with orange rim light on the very top of the palms; the valley mist glows pink-orange; the far hills are layered purple. Overall grade: dramatic, saturated warm reds and oranges with deep violet shadows.",
}

WEATHER = {
    "clear": "CLEAR sky: no clouds at all, a clean sky. Keep the colour of the sky and the light entirely as the time of day above says (at night: a clear starry sky, many fine stars, a faint milky way far from the centre, NO moon). The ground is dry.",
    "partly": "PARTLY CLOUDY: scattered soft cumulus clouds covering about 40 percent of the sky with clear gaps between them, kept away from the upper-middle area above the volcano's peak (leave that a clean gap). The clouds take the colours of the time of day above (bright white by day, pink or gold or red at sunrise and sunset, a darker blue-grey at night with a few stars in the gaps). Some drifting cloud shadows on the far hills by day. The ground is dry.",
    "cloudy": "CLOUDY: the whole sky is covered by ONE even layer of plain neutral grey cloud with only slight tone variations. NO lighting effects at all: no blue gap, no sun, no glow, no bright strip or coloured band at the horizon, no sunbeams, no warm, pink, orange, red or gold light anywhere, in the sky, on the volcano, in the mist or on the jungle. The light is flat and diffuse with no visible shadows and low contrast. The ground is dry or slightly damp, the valley mist pale grey. The only thing the time of day changes is the overall brightness (given below).",
    "dark": "DARK STORM CLOUDS: the whole sky is covered edge to edge by a thick, heavy, low layer of very dark slate-grey and blue-black storm clouds with strong texture and dramatic hanging cloud bases. There is NO sun at all: no sun disc, no sun glow, no bright or pale patch behind the volcano, no light gap in the clouds, no sunbeams, and NO orange, red, amber, yellow, pink or gold colour anywhere, not in the sky, not on the volcano, not in the mist, not on the jungle. The cloud layer reaches all the way down to the far hills: there is NO gap, NO strip and NO lighter band of sky between the cloud bases and the horizon, and the sky just above the far hills is as dark as the clouds, never pale, pink, salmon or light blue. The light is cold, dim and flat. The volcano is a cold grey-brown with thin grey mist on its flanks, the jungle deep blue-green with a wet shine and wind-bent palm leaves, thick grey mist in the valleys. No rain streaks, no rain curtains and no lightning bolts. The time of day is shown ONLY by the overall brightness and a faint dull tint (given below), never by a sun or a coloured light.",
    "snow": "SNOW: a calm winter scene after heavy snowfall, under a thick even layer of WHITE-GREY SNOW CLOUDS covering the whole sky edge to edge, down to the far hills (soft overcast with subtle cloud texture, no gap, no clear sky, no blue). There is NO sun lighting at all: no sun, no sun glow, no bright or coloured band at the horizon, no sunbeams, no warm, pink, orange, red or gold colour anywhere, in the sky, on the snow, in the mist. The light is flat, soft and diffuse. The volcano's upper half is white with snow, every palm, tree and leaf of the jungle is covered in thick white snow resting on the branches and the tops, the trunks and the shadowed undersides stay dark, the far hills are white with dark tree lines, the valley mist is thin and white. The snow cover is high and even, fully covering all trees, and EXACTLY the same at every time of day. NO falling snow: no snowflakes, no flakes in the air, no snow streaks, the air is clear. The time of day changes only the overall brightness and a faint dull tint (given below).",
}

BRIGHT = {
    "cloudy": {
        "night": "NIGHT: really dark. The grey cloud layer is nearly black blue-grey, average brightness about 4 percent; the landscape is a near-black silhouette; NO stars, no moon, no glow.",
        "sunrise": "EARLY MORNING: dim. Plain neutral grey cloud, brightness about 35 percent, landscape dim and flat. No colour, no glow.",
        "morning": "MORNING: medium. Plain neutral grey cloud, brightness about 55 percent, landscape soft and flat. No colour, no glow.",
        "midday": "MIDDAY: the brightest. Light neutral grey cloud, brightness about 70 percent, landscape evenly and softly lit, low contrast. No colour, no glow.",
        "golden": "LATE AFTERNOON: medium-dim. Plain neutral grey cloud, brightness about 45 percent, landscape soft and flat. No colour, no glow.",
        "sunset": "DUSK: dim. Plain neutral grey cloud, brightness about 28 percent, landscape dim and flat, mist grey. No colour, no glow.",
    },
    "dark": {
        "night": "NIGHT: pitch dark. Average brightness about 2 percent: the sky is almost black, the volcano and jungle are black shapes you can barely tell apart, no stars, no glow.",
        "sunrise": "EARLY MORNING: dark, average brightness about 22 percent, neutral cold blue-grey, NO tint of any other colour.",
        "morning": "MORNING: dark, average brightness about 30 percent, cold slate blue-grey, no other tint.",
        "midday": "MIDDAY: the lightest of the dark set but still a heavy storm, average brightness about 38 percent, dull slate-grey, details of the volcano and jungle readable.",
        "golden": "LATE AFTERNOON: dark, average brightness about 27 percent, dull slate-grey, no other tint.",
        "sunset": "DUSK: very dark, average brightness about 14 percent, dull cold blue-grey, no other tint (no pink, no violet, no brown).",
    },
    "snow": {
        "night": "NIGHT: really dark. Same snow cover, but the whole picture is very dark, average brightness about 6 percent: the cloud layer near black blue-grey, the snow only a faint dim blue-grey, trees black. No stars, no glow.",
        "sunrise": "EARLY MORNING: dim, average brightness about 40 percent: the cloud layer and the snow are a dull cool grey with the faintest dull mauve tint (desaturated, no pink, no orange).",
        "morning": "MORNING: average brightness about 58 percent: the cloud layer white-grey, the snow cool white with a faint cool blue tint.",
        "midday": "MIDDAY: the brightest, average brightness about 78 percent: the cloud layer bright white-grey, the snow clean white, neutral light.",
        "golden": "LATE AFTERNOON: average brightness about 50 percent: the cloud layer and the snow a dull warm-neutral grey-white (a very faint dull cream tint, desaturated, not gold, not orange).",
        "sunset": "DUSK: dim, average brightness about 26 percent: the cloud layer and the snow a dull grey with a faint dull blue-violet tint (desaturated, no orange, no red).",
    },
}


def time_text(w, t):
    return BRIGHT[w][t] if w in BRIGHT else TIMES[t]


JOBS = [("%s-%s" % (w, t), "%s\n\nTIME OF DAY: %s\n\nWEATHER: %s" % (COMMON, time_text(w, t), WEATHER[w]))
        for w in WEATHER for t in TIMES]


def copy(text):
    subprocess.run(["clip"], input=text.encode("utf-16le"), check=True)


def found(out, key):
    return any(os.path.exists(os.path.join(out, key + e)) for e in EXT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--downloads", default=os.path.join(os.path.expanduser("~"), "Downloads"))
    ap.add_argument("--out", default=os.path.join(ROOT, "new-scenes", "volcano"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    seen = set(os.listdir(a.downloads))
    sizes, last = {}, None
    print("Watching %s -> %s   (Ctrl+C to stop)" % (a.downloads, a.out))
    while True:
        missing = [j for j in JOBS if not found(a.out, j[0])]
        if not missing:
            print("All %d pictures are here." % len(JOBS))
            return
        key, prompt = missing[0]
        if key != last:
            copy(prompt)
            last = key
            print("\a\n[%02d/%d] %s: the prompt is in the clipboard. Gemini: new chat, attach 1-volcano.jpg, Ctrl+V, send, download."
                  % (len(JOBS) - len(missing) + 1, len(JOBS), key))
        for name in sorted(os.listdir(a.downloads)):
            ext = os.path.splitext(name)[1].lower()
            if name in seen or ext not in EXT:
                continue
            path = os.path.join(a.downloads, name)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if sizes.get(name) != size:   # still being written: wait until the size stops changing
                sizes[name] = size
                continue
            shutil.move(path, os.path.join(a.out, key + ext))
            seen.add(name)
            print("   saved %s%s" % (key, ext))
            break
        time.sleep(1.2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
