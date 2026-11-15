"""doctor.py — say whether this machine can run the figure pipeline, and what to fix.

Run before anything else on a new machine, and after any pip/npm change.
"""
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]

FONT_NEEDLES = {
    "noto-serif slices": ("package", "index.css"),
    "noto-sans slices": ("sans/package", "index.css"),
    "LXGW WenKai Screen": ("lxgw-wenkai-screen-webfont-1.7.0/package", "lxgwwenkaigbscreen.css"),
    "EB Garamond": ("fontsource-eb-garamond-5.3.0/package", "400.css"),
    "Huiwen Mincho": ("fontpkg-huiwen-mincho-1.0.0/package", "Huiwen-mincho.otf"),
}


def fonts_root():
    env = os.environ.get("FIGKIT_FONTS")
    if env:
        return Path(env)
    for cand in (ROOT / "fonts", HERE / "fonts-src", ROOT.parent / "fonts-src"):
        if cand.exists():
            return cand
    return ROOT / "fonts"


def ok(label, detail=""):
    print(f"  OK   {label}{('  ' + detail) if detail else ''}")


def bad(label, fix):
    print(f"  FAIL {label}\n         fix: {fix}")


def main():
    fails = 0
    print(f"python {sys.version.split()[0]} on {platform.system()}")

    print("\n[1] python packages")
    for mod, hint in (("fontTools", "python -m pip install fonttools brotli"),
                      ("PIL", "python -m pip install pillow"),
                      ("lxml", "python -m pip install lxml  # only 汇文明朝体 needs it")):
        try:
            __import__(mod)
            ok(mod)
        except Exception:
            fails += 1
            bad(mod, hint)

    print("\n[2] headless chrome")
    chrome = os.environ.get("CHROME_PATH")
    if not chrome:
        chrome = next((p for p in CHROME_CANDIDATES if Path(p).exists()), None)
    if chrome:
        ok("chrome", chrome)
    else:
        fails += 1
        bad("chrome", "install Chrome, or set CHROME_PATH to the executable")

    print("\n[3] fonts")
    fr = fonts_root()
    print(f"       fonts root: {fr}")
    for label, (subdir, name) in FONT_NEEDLES.items():
        hit = (fr / subdir / name) if fr.exists() else None
        if hit and hit.exists():
            ok(label, str(hit.parent))
        else:
            fails += 1
            bad(label, "powershell -ExecutionPolicy Bypass -File scripts/fetch_fonts.ps1")

    print("\n[4] diagram-design skill (optional: self_check / verify_geometry)")
    ddir = os.environ.get("DIAGRAM_SKILL_DIR")
    repo_root = HERE.parents[2]
    cands = [Path(ddir)] if ddir else [
        ROOT / "vendor" / "diagram-design",
        repo_root.parent / ".cache" / "design-kit" / "vendor" / "diagram-design" / "skills" / "diagram-design",
    ]
    hit = next((c for c in cands if (c / "scripts" / "self_check.py").exists()), None)
    if hit:
        ok("diagram-design", str(hit))
    else:
        print("  WARN not installed — pages still build; only the two extra checkers are unavailable.\n"
              "         fix: clone cathrynlavery/diagram-design and set DIAGRAM_SKILL_DIR")

    print("\n[5] fonts on disk are big — do not commit them")
    if fr.exists():
        size = sum(f.stat().st_size for f in fr.rglob("*") if f.is_file())
        print(f"       {fr}: {size / 1e6:.0f} MB")

    print("\n" + ("all required pieces are here" if fails == 0 else f"{fails} required piece(s) missing"))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
