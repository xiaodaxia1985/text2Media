"""给视频用的页：同一份 HTML，把「给人读」的标题层藏掉，只留图形区。

为什么必须有这一步：图解页是**给人读的文章页**，页首 h1＋导语本身就够醒目。
直接搬进视频、再在旁边叠一句屏幕大字，一屏就有两套大话，观众听的和看的都不是
同一句——实测「锁住、隔开、稳住」和叠上去的「信托一次办三件事」在抢同一只眼。

所以视频素材取的是同一份 HTML 的**图形区**：藏掉 mark / h1 / dek / legend / foot /
callout，页宽不变，截图后按纸色裁到内容边界。

    python videopage.py <html目录> <视频页输出目录> [--width 1080] [--keep-callout]

需要 Chrome。找不到就报错停下（不静默降级成"用原页凑"）。
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

CHROME = os.environ.get("ARTICLE_VIDEO_CHROME") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PAPER = (245, 245, 245)
TOL = 6
HIDE = ".mark,h1,.dek,.legend,.foot"
STYLE = (
    "<style>%s{display:none!important}"
    ".figure{margin:0!important;min-width:0!important;overflow:visible!important}"
    "body{overflow:hidden}"
    "</style>"
)


def trim(src, dst, pad=10):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    top, bottom, left, right = None, None, None, None
    for y in range(h):
        if any(abs(px[x, y][0] - PAPER[0]) > TOL or abs(px[x, y][1] - PAPER[1]) > TOL
               or abs(px[x, y][2] - PAPER[2]) > TOL for x in range(0, w, 4)):
            top = y
            break
    for y in range(h - 1, -1, -1):
        if any(abs(px[x, y][0] - PAPER[0]) > TOL or abs(px[x, y][1] - PAPER[1]) > TOL
               or abs(px[x, y][2] - PAPER[2]) > TOL for x in range(0, w, 4)):
            bottom = y
            break
    for x in range(w):
        if any(abs(px[x, y][0] - PAPER[0]) > TOL or abs(px[x, y][1] - PAPER[1]) > TOL
               or abs(px[x, y][2] - PAPER[2]) > TOL for y in range(0, h, 4)):
            left = x
            break
    for x in range(w - 1, -1, -1):
        if any(abs(px[x, y][0] - PAPER[0]) > TOL or abs(px[x, y][1] - PAPER[1]) > TOL
               or abs(px[x, y][2] - PAPER[2]) > TOL for y in range(0, h, 4)):
            right = x
            break
    if None in (top, bottom, left, right):
        return None
    box = (max(0, left - pad), max(0, top - pad), min(w, right + pad), min(h, bottom + pad))
    im.crop(box).save(dst)
    return im.crop(box).size


def main(argv):
    pos = [a for a in argv if not a.startswith("--")]
    width = 1080
    if "--width" in argv:
        width = int(argv[argv.index("--width") + 1])
    keep_callout = "--keep-callout" in argv
    if len(pos) < 2:
        print(__doc__)
        return 2
    src_dir, dst_dir = Path(pos[0]), Path(pos[1])
    dst_dir.mkdir(parents=True, exist_ok=True)
    hide = HIDE if keep_callout else HIDE + ",.callout"
    if not Path(CHROME).exists():
        print(f"FAIL  找不到 Chrome：{CHROME}（用 ARTICLE_VIDEO_CHROME 指过去）")
        return 1

    pages = sorted(src_dir.glob("*.html"))
    if not pages:
        print(f"FAIL  {src_dir} 里没有 HTML")
        return 1
    ok = 0
    for p in pages:
        html = p.read_text(encoding="utf-8")
        html = html.replace("</head>", STYLE % hide + "</head>", 1)
        tmp_html = dst_dir / f"_v_{p.stem}.html"
        tmp_html.write_text(html, encoding="utf-8")
        raw = dst_dir / f"_raw_{p.stem}.png"
        with tempfile.TemporaryDirectory() as td:
            cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                   "--force-device-scale-factor=1", "--virtual-time-budget=9000",
                   f"--user-data-dir={td}", f"--screenshot={raw}", f"--window-size={width},2000",
                   tmp_html.resolve().as_uri()]
            r = subprocess.run(cmd, capture_output=True, text=True)
        if not raw.exists():
            print(f"FAIL  {p.name} 截图失败：{(r.stderr or '').strip()[:200]}")
            return 1
        size = trim(raw, dst_dir / (p.stem + ".png"))
        raw.unlink(missing_ok=True)
        tmp_html.unlink(missing_ok=True)
        if not size:
            print(f"FAIL  {p.name} 裁不出内容（整页都是纸色？）")
            return 1
        print(f"{p.stem}.png  {size[0]}×{size[1]}")
        ok += 1
    print(f"图形区页 {ok} 张 → {dst_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
