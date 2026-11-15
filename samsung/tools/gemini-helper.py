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

COMMON = """Edit the attached photo (it is the base). This is a photo edit, not a new picture. Re-render the WHOLE photo as if it had been taken at a different moment with different weather, and keep the GEOMETRY identical: same camera position, same lens, same framing, same horizon line at the same height, and the volcano, every hill, ridge, tree line and palm in exactly the same position, shape and size. Do not add, remove, move, crop or zoom anything in the landscape. No people, no animals, no birds, no boats, no buildings, no text, no logos, no watermark. Keep the upper-middle part of the sky (centred horizontally, in the top 45 percent of the picture) smooth and uncluttered, with no bright spot, no bird, no airplane and no strong detail, because a large clock is shown there. The sun or moon is never visible in the picture: it is outside the frame.
THE LIGHT MUST CHANGE, NOT ONLY THE CLOUDS. Re-light every part of the landscape (volcano, jungle, valley mist, far hills, sky) for the time and weather below: direction and strength of the light, colour temperature, contrast, colour of the shadows, haze, how wet or dry surfaces look, the colour of the vegetation and rock. Do not paste clouds into the original sky and leave the old lighting. Output: a photograph, natural, realistic, high detail, no painting or illustration look, 16:9, as large as you can (3840x2160 is best)."""

TIMES = {
    "night": "NIGHT, about 2 hours after sunset, no sun and no moon anywhere. The only light is the faint glow of the sky; everything on the ground is dark. The volcano is a dark blue-black shape against the sky, the jungle is almost black with only a faint cool blue edge light on the tops of the palms, the valley mist is a pale dim blue-grey band, the far hills are layered dark blue silhouettes. All warm colours are gone. Overall grade: very dark navy blue, deep blacks, low contrast, calm.",
    "sunrise": "SUNRISE, the sun just below the horizon outside the frame on the left, the sky glowing. Soft pink, peach and pale orange near the horizon fading to cool blue-violet higher up. Light is low, soft and warm-pink on the upper slopes of the volcano, the rest of the volcano a cool mauve; the jungle is still dark, deep blue-green with only the highest palm tops catching pink; thick pale pink-gold mist lies in every valley. The far hills are layered violet-blue. Overall grade: gentle, pastel, cool shadows with warm pink highlights, misty.",
    "morning": "MORNING, about two hours after sunrise, the sun low on the left outside the frame. Fresh, clear, slightly cool-white light with a faint warm tint. Long soft shadows on the volcano's left slopes, the volcano a warm tan-brown with visible ridges, the jungle a fresh green with yellow-green highlights on the palms and dark blue-green shadows, a thin silver mist still lying in the valleys. The far hills are pale blue-grey. Overall grade: bright, fresh, clean, slightly cool.",
    "midday": "MIDDAY, the sun high, outside the frame above the viewer. Bright neutral-white light, strong but even; shadows short and hard-edged under the palms, the volcano evenly lit in grey-brown with strong rock detail and no glow, the jungle a saturated vivid mid-green, no valley mist (only a faint haze), the far hills a clear pale blue. Overall grade: bright, high clarity, saturated, slightly high contrast.",
    "golden": "GOLDEN HOUR, about one hour before sunset, the sun low on the left outside the frame. Warm gold light, long soft shadows. The volcano glows warm amber-gold on its lit slopes with deep brown-violet shadows in the gullies; the jungle is lit gold on the palm tops and dark green below; a thin golden haze lies in the valleys. The far hills are layered soft orange-blue. Overall grade: rich, warm gold, soft contrast, glowing.",
    "sunset": "SUNSET, the sun just touching the horizon outside the frame on the left. Deep orange, red and magenta sky near the horizon, fading to purple and dark blue at the top. The light is very low and red-orange: the volcano's lit slopes glow deep red-orange and its shadowed side is dark purple; the jungle is nearly silhouette, dark green-black with orange rim light on the very top of the palms; the valley mist glows pink-orange; the far hills are layered purple. Overall grade: dramatic, saturated warm reds and oranges with deep violet shadows.",
}

WEATHER = {
    "clear": "CLEAR sky: no clouds at all, a clean sky. Keep the colour of the sky and the light entirely as the time of day above says (at night: a clear starry sky, many fine stars, a faint milky way far from the centre, NO moon). The ground is dry.",
    "partly": "PARTLY CLOUDY: scattered soft cumulus clouds covering about 40 percent of the sky with clear gaps between them, kept away from the upper-middle area above the volcano's peak (leave that a clean gap). The clouds take the colours of the time of day above (bright white by day, pink or gold or red at sunrise and sunset, a darker blue-grey at night with a few stars in the gaps). Some drifting cloud shadows on the far hills by day. The ground is dry.",
    "cloudy": "CLOUDY: the whole sky covered by one layer of grey cloud, mid-grey, soft and even, with only slight tone variations; no blue gap, no sun. The light is diffused and flat: soft or invisible shadows, reduced contrast, colours muted and a little cooler. At sunrise, golden hour and sunset keep only a faint tinted glow in the cloud near the horizon and a slight warm tint on the ground. At night the cloud is dark blue-black, slightly lighter near the horizon, with NO stars. The ground is dry or slightly damp.",
    "dark": "DARK STORM CLOUDS: the whole sky covered by a thick, heavy, low layer of very dark slate-grey and blue-black storm clouds with strong texture and dramatic hanging cloud bases, lighter grey-green patches in a few places, no blue sky, no sun, no bright area where the sun would be. Far on the left and right, grey curtains of rain blur the distant hills. The light is cold, dim and low, the ground wet and dark: the volcano a dark cold grey-brown with low cloud clinging to its flanks, the jungle deep blue-green with a wet shine and wind-bent palm leaves, thick grey mist in the valleys. At sunrise, golden hour and sunset there is only a thin dull amber strip of light at the very bottom of the sky; at night everything is almost black. Overall grade: dark, moody, cold, desaturated, high contrast.",
    "snow": "SNOW: calm winter snowfall. The sky is a smooth pale white-grey (at night a dim blue-grey glow). The volcano's upper slopes and the palms and trees are covered in white snow resting on every leaf and branch, the trunks and shadowed undersides stay dark, the far hills are white with dark tree lines, the valley mist is thin and white. Soft small snowflakes fall at different depths, a few larger and blurred in the foreground, not too dense. The light is flat, soft and cool; the time of day above only changes the brightness and tints the sky and snow faintly (pink at sunrise, gold at golden hour, orange-red at sunset, deep blue at night). No sun, no shadows.",
}

JOBS = [("%s-%s" % (w, t), "%s\n\nTIME OF DAY: %s\n\nWEATHER: %s" % (COMMON, TIMES[t], WEATHER[w]))
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
