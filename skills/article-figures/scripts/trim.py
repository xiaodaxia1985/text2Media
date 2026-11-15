"""Crop the empty bottom of every page screenshot.

    python trim.py                 # every PNG in out/
    python trim.py 01-timeline ...  # just these
    python trim.py --keep 80       # leave this much below the last busy row

Pages are shot at a fixed window height (taller than any page), so a short
figure page leaves a huge blank strip at the bottom. Trimming by measured
content, not by a guessed crop, keeps the contact sheet honest.
"""
import os
import sys
from pathlib import Path

from PIL import Image

OUT = Path(os.environ.get("FIGKIT_OUT") or Path(__file__).resolve().parent) / "out"
PAPER = tuple(int(os.environ.get("FIGKIT_PAPER", "#f5f5f5").lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
TOL = int(os.environ.get("FIGKIT_TRIM_TOL", "6"))


def last_busy_row(im):
    w, h = im.size
    px = im.load()
    for y in range(h - 1, -1, -1):
        for x in range(0, w, 3):
            r, g, b = px[x, y]
            if abs(r - PAPER[0]) > TOL or abs(g - PAPER[1]) > TOL or abs(b - PAPER[2]) > TOL:
                return y
    return h - 1


def main(argv):
    keep = 40
    names = []
    i = 0
    while i < len(argv):
        if argv[i] == "--keep" and i + 1 < len(argv):
            keep = int(argv[i + 1]); i += 2; continue
        names.append(argv[i]); i += 1

    paths = ([OUT / (n if n.endswith(".png") else n + ".png") for n in names]
             if names else sorted(OUT.glob("*.png")))
    if not paths:
        print(f"no PNGs in {OUT}")
        return 1
    for p in paths:
        im = Image.open(p).convert("RGB")
        w, h = im.size
        bottom = min(h, last_busy_row(im) + keep)
        im.crop((0, 0, w, bottom)).save(p)
        print(p.name, "->", w, bottom)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
