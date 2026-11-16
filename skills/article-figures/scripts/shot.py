# -*- coding: utf-8 -*-
"""把 HTML 截成固定画幅 PNG（默认 1080×1440，即 3:4）。

为什么固定画幅：页高是算出来的（3:4 页 1440、横页 800），截图窗口比页高时，
页面下方会多出一截背景色。固定窗口按页面尺寸截，不出多余留白；万一页比窗口高，
`trim.py` 还能按纸色再裁一次。

用法::

    python scripts/shot.py out                     # 截 out/ 下所有 html，1080×1440
    python scripts/shot.py out --size 1080x800     # 横页
    python scripts/shot.py a.html b.html --out out

Chrome 路径不写死：先看 `ARTICLE_FIG_CHROME`，再试本机常见位置，最后找 PATH 里的
chrome / chromium / google-chrome。找不到会明确报错，不会静默截半张。
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chromium",
    "chromium-browser",
]


def find_chrome():
    env = os.environ.get("ARTICLE_FIG_CHROME")
    if env and Path(env).exists():
        return Path(env)
    for cand in CANDIDATES:
        p = Path(cand)
        if p.exists():
            return p
        which = shutil.which(cand)
        if which:
            return Path(which)
    raise SystemExit("找不到 Chrome：设 ARTICLE_FIG_CHROME 指到可执行文件")


def shot(html, out_dir, width, height, chrome, budget=9000):
    # Chrome 的 --screenshot 不认相对路径，必须先落成绝对路径（2026-11-16 实测报 0x3）
    png = (Path(out_dir) / (Path(html).stem + ".png")).resolve()
    png.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        cmd = [str(chrome), "--headless=new", "--disable-gpu", "--hide-scrollbars",
               "--force-device-scale-factor=1", f"--virtual-time-budget={budget}",
               f"--user-data-dir={td}", f"--screenshot={png}",
               f"--window-size={width},{height}", Path(html).resolve().as_uri()]
        r = subprocess.run(cmd, capture_output=True, text=True)
    if not png.exists():
        print(f"FAIL  {Path(html).name}: {(r.stderr or '').strip()[:200]}")
        return False
    print(f"shot  {png.name}  {width}×{height}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="+", help="html 文件，或一个目录（截其中所有 *.html）")
    ap.add_argument("--out", help="PNG 输出目录，默认与 html 同目录")
    ap.add_argument("--size", default="1080x1440", help="宽x高，默认 1080x1440（3:4）")
    ap.add_argument("--budget", type=int, default=9000, help="等字体就位的毫秒数")
    a = ap.parse_args()

    width, height = (int(x) for x in a.size.lower().split("x"))
    pages = []
    for t in a.targets:
        p = Path(t)
        pages += sorted(p.glob("*.html")) if p.is_dir() else [p]
    if not pages:
        raise SystemExit("没有 html：先跑文章的 make 脚本")

    chrome = find_chrome()
    bad = []
    for h in pages:
        out_dir = Path(a.out) if a.out else h.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        if not shot(h, out_dir, width, height, chrome, a.budget):
            bad.append(h.name)
    print(f"\n{len(pages) - len(bad)}/{len(pages)} 截图完成　{width}×{height}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
