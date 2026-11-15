"""Inline only the font slices a page actually needs, subset to its glyphs.

Every CJK family ships as ~100 woff2 slices, one per unicode-range block; a page
needs a handful of them, and within each slice a few dozen glyphs. We subset each
slice down to those codepoints (variable axes kept), base64 the bytes, and hand
back a CSS block that keeps the page self-contained — no network, no
installed-font dependency.

Families:
  serif   Noto Serif SC VF   (variable 200-900) — headings, body, callouts
  sans    Noto Sans SC VF    (variable 200-900) — labels, axes, captions
  wenkai  LXGW WenKai Screen (400 only)         — lead paragraph, quotes
  instr   Instrument Serif   (400, latin)       — numerals (alt)
  gara    EB Garamond        (400, latin)       — numerals
"""
import base64
import os
import re
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


def _src_root():
    """Where the unpacked font packages live.

    Kept deliberately dumb so the same file works both in the scratch lab and as
    part of the shipped skill: FIGKIT_FONTS wins, then a sibling `fonts-src`
    (lab layout), then `fonts/` next to the script's parent (skill layout).
    """
    env = os.environ.get("FIGKIT_FONTS")
    if env:
        return Path(env)
    here = Path(__file__).resolve().parent
    for cand in (here / "fonts-src", here.parent / "fonts-src",
                 here.parent / "fonts", here / "fonts"):
        if cand.exists():
            return cand
    return here / "fonts-src"


SRC = _src_root()
FAMILIES = {
    "serif": {
        "css": SRC / "package" / "index.css",
        "files": SRC / "package" / "files",
        "name": "Noto Serif SC VF",
        "weight": "200 900",
    },
    "sans": {
        "css": SRC / "sans" / "package" / "index.css",
        "files": SRC / "sans" / "package" / "files",
        "name": "Noto Sans SC VF",
        "weight": "200 900",
    },
    "wenkai": {
        "css": SRC / "lxgw-wenkai-screen-webfont-1.7.0" / "package" / "lxgwwenkaigbscreen.css",
        "files": SRC / "lxgw-wenkai-screen-webfont-1.7.0" / "package" / "files",
        "name": "LXGW WenKai Screen",
        "weight": "400 400",
    },
    "instr": {
        "css": SRC / "fontsource-instrument-serif-5.3.0" / "package" / "400.css",
        "files": SRC / "fontsource-instrument-serif-5.3.0" / "package" / "files",
        "name": "Instrument Serif",
        "weight": "400 400",
    },
    "gara": {
        "css": SRC / "fontsource-eb-garamond-5.3.0" / "package" / "400.css",
        "files": SRC / "fontsource-eb-garamond-5.3.0" / "package" / "files",
        "name": "EB Garamond",
        "weight": "400 400",
    },
    # single-file, pre-sliced: no unicode-range, subset straight to the page's glyphs
    "jinghua": {
        "file": SRC / "fontpkg-king-hwa-old-song-2.2.0" / "package" / "京華老宋体v2.002.ttf",
        "name": "KingHwa OldSong",
        "weight": "400 400",
    },
    "huiwen": {
        "file": SRC / "fontpkg-huiwen-mincho-1.0.0" / "package" / "Huiwen-mincho.otf",
        "name": "Huiwen Mincho",
        "weight": "400 400",
    },
}
DEFAULT_FAMILIES = ("serif", "sans", "wenkai", "gara")

FACE_RE = re.compile(
    r"src: url\(\./files/(?P<file>[^)]+\.woff2)\).*?unicode-range: (?P<range>[^;]+);",
    re.S,
)
RANGE_RE = re.compile(r"U\+([0-9a-fA-F?]{1,6})(?:-([0-9a-fA-F]{1,6}))?")

_faces_cache = {}
_cmap_cache = {}
_bytes_cache = {}


def _points(range_text):
    out = set()
    for a, b in RANGE_RE.findall(range_text):
        if "?" in a:
            lo, hi = int(a.replace("?", "0"), 16), int(a.replace("?", "f"), 16)
        else:
            lo = int(a, 16)
            hi = int(b, 16) if b else lo
        out.add((lo, hi))
    return out


def _faces(kind):
    if kind in _faces_cache:
        return _faces_cache[kind]
    spec = FAMILIES[kind]
    if "file" in spec:
        faces = [(spec["file"], None)]
    else:
        css = spec["css"].read_text(encoding="utf-8")
        faces = [(spec["files"] / m.group("file"), m.group("range").strip())
                 for m in FACE_RE.finditer(css)]
    _faces_cache[kind] = faces
    return faces


def _cmap(path):
    if path not in _cmap_cache:
        _cmap_cache[path] = set(TTFont(str(path), lazy=True).getBestCmap())
    return _cmap_cache[path]


def _subset(path, codepoints):
    key = (path, tuple(sorted(codepoints)))
    if key in _bytes_cache:
        return _bytes_cache[key]
    f = TTFont(str(path))
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = False
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=codepoints)
    s.subset(f)
    buf = BytesIO()
    f.flavor = "woff2"
    f.save(buf)
    data = buf.getvalue()
    _bytes_cache[key] = data
    return data


def build_css(text, kinds=DEFAULT_FAMILIES):
    chars = {ord(c) for c in text if c.strip()}
    blocks = []
    for kind in kinds:
        spec = FAMILIES[kind]
        for path, range_text in _faces(kind):
            if not path.exists():
                continue
            if range_text is None:
                hit = chars
            else:
                spans = _points(range_text)
                hit = {cp for cp in chars if any(lo <= cp <= hi for lo, hi in spans)}
            if not hit:
                continue
            try:
                data = _subset(path, hit)
            except Exception:
                data = path.read_bytes()
            b64 = base64.b64encode(data).decode("ascii")
            rng = f"unicode-range:{range_text};" if range_text else ""
            blocks.append(
                "@font-face{font-family:'%s';font-style:normal;font-display:block;"
                "font-weight:%s;src:url(data:font/woff2;base64,%s) format('woff2');%s}"
                % (spec["name"], spec["weight"], b64, rng)
            )
    return "\n".join(blocks)
