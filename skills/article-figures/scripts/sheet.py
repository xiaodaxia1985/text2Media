"""Contact sheet of every rendered figure page.

    python sheet.py                     # every PNG in out/, auto column count
    python sheet.py 01-timeline 02-waterfall
    python sheet.py --cols 4 --out all.png

Nothing here assumes a fixed number of figures: the list comes from disk (or
from argv), and the grid picks a column count that keeps cells readable —
past ~5 columns a thumbnail stops telling you anything and you should split
the set into volumes instead.
"""
import math
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(os.environ.get("FIGKIT_OUT") or Path(__file__).resolve().parent) / "out"
BG = os.environ.get("FIGKIT_SHEET_BG", "#e9e7e4")
CARD = os.environ.get("FIGKIT_SHEET_CARD", "#f5f5f5")
RULE = os.environ.get("FIGKIT_SHEET_RULE", "#bfc0c0")


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def auto_cols(n):
    if n <= 4:
        return 2
    if n <= 9:
        return 3
    if n <= 16:
        return 4
    return 5


def main(argv):
    cols = None
    out_name = os.environ.get("FIGKIT_SHEET_NAME", "figures-sheet.png")
    names = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--cols" and i + 1 < len(argv):
            cols = int(argv[i + 1]); i += 2; continue
        if a == "--out" and i + 1 < len(argv):
            out_name = argv[i + 1]; i += 2; continue
        names.append(a); i += 1

    if names:
        paths = []
        for n in names:
            p = OUT / (n if n.endswith(".png") else n + ".png")
            if not p.exists():
                print("missing:", p)
                return 1
            paths.append(p)
    else:
        paths = sorted(OUT.glob("*.png"))
        if not paths:
            print(f"no PNGs in {OUT} — run the screenshot step first")
            return 1

    imgs = [Image.open(p).convert("RGB") for p in paths]
    cell_w = max(i.width for i in imgs)
    cell_h = max(i.height for i in imgs)
    cols = cols or auto_cols(len(imgs))
    rows = math.ceil(len(imgs) / cols)
    gap, pad = 26, 44

    W = pad * 2 + cols * cell_w + (cols - 1) * gap
    H = pad * 2 + rows * cell_h + (rows - 1) * gap

    sheet = Image.new("RGB", (W, H), hex2rgb(BG))
    d = ImageDraw.Draw(sheet)
    for idx, im in enumerate(imgs):
        r, c = divmod(idx, cols)
        x = pad + c * (cell_w + gap)
        y = pad + r * (cell_h + gap)
        # every cell gets the same paper card so a shorter page does not read as a hole
        cell = Image.new("RGB", (cell_w, cell_h), hex2rgb(CARD))
        cell.paste(im, (0, 0))
        d.rectangle([x - 1, y - 1, x + cell_w, y + cell_h], outline=hex2rgb(RULE), width=1)
        sheet.paste(cell, (x, y))
        d.text((x + 6, y + 6), str(idx + 1), fill=(120, 126, 138))

    path = (OUT.parent / out_name)
    sheet.save(path)
    print(f"{path}  {sheet.size}  {len(imgs)} pages in {rows}×{cols}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
