# -*- coding: utf-8 -*-
"""3:4 竖版封面页壳（1080×1440）：小红书与抖音共用一张。

版式按信息流规律定，不是把图解页换个画幅：**脸要大、字要少、对比要强**。
标题三行短句（每行 ≤6 字，第三行可落朱红）、满幅人像占画面近半、一句 dek、一行页脚，
不放目录——目录是给「已经点进来的人」看的，封面阶段它只是噪音。

用法（在文章工作目录里）::

    from cover34 import write_cover
    write_cover("00-cover.html",
                h1_html='AI 生成变便宜了<br>最稀缺的是<br><span class="l3">验证和负责</span>',
                title="AI 生成变便宜了，最稀缺的是验证和负责",
                eyebrow="洞察 · AI 与产品",
                count="8 张图解",
                photo=r"assets/li-yanhong.png",
                alt="李彦宏",
                cap="李彦宏「下一幕」讲了十二年：2016 年四次表态，2025 年是一本账。",
                dek="AI 越来越会做事，可验证它、为它负责，没有跟着变便宜。",
                foot_left="原文｜个人商业创造者 · 小红书 / 抖音",
                foot_right="1080×1440　封面　两平台共用")

标题里含 <span> 就不要把整串过 numspan——正则会把 class 里的数字包进去，
渲染成 `3">…`（2026-11-16 踩过）。数字在标题里自己写 <span class="num">。
"""
import base64
import os
import re
from pathlib import Path

import fontkit

OUT = Path(os.environ.get("FIGKIT_OUT") or Path(__file__).resolve().parent)
OUT.mkdir(parents=True, exist_ok=True)

PAPER = "#f5f5f5"
INK = "#2d3142"
MUTED = "#4f5d75"
SOFT = "#5a6580"
ACCENT = "#bf4520"

W, H = 1080, 1440
HERO_H = 720          # 人像区高度：占画面一半，脸上的字不再往上压
TITLE_SIZE = 97       # 三行短句在这个字号下最长一行 7 字刚好撑住 952 宽

DIGITS = re.compile(r"(\d[\d,]*(?:\.\d+)?(?:%|亿|万)?)")


def numspan(text):
    return DIGITS.sub(lambda m: f'<span class="num">{m.group(1)}</span>', text)


HTML = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>%TITLE%</title>
<style>
%FONTS%
*{margin:0;padding:0;box-sizing:border-box}
body{width:%W%px;min-height:%H%px;background:%PAPER%;color:%INK%;
     font-family:"Noto Sans SC VF",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{width:%W%px;min-height:%H%px;padding:68px 0 46px;display:flex;flex-direction:column}
.mark{display:flex;align-items:baseline;gap:14px;padding:0 64px;margin-bottom:34px}
.mark b{font-size:15px;font-weight:600;letter-spacing:.10em;color:%MUTED%}
.mark span{font-size:13.5px;color:%SOFT%;letter-spacing:.04em}
.mark em{font-style:normal;margin-left:auto;font-size:13px;color:%SOFT%;letter-spacing:.06em}
.hd{padding:0 64px}
h1{font-family:"Noto Serif SC VF",serif;font-weight:700;font-size:%TS%px;line-height:1.1;letter-spacing:.01em}
h1 .l3{color:%ACCENT%}
.rule{height:1px;background:rgba(45,49,66,.18);margin:26px 0 0}
.hero{margin-top:30px}
.hero img{display:block;width:%W%px;height:%HERO%px;object-fit:cover}
.hero .bar{height:4px;background:%ACCENT%}
.cap{padding:12px 64px 0;font-size:11.5px;color:#8b92a0}
.dek{padding:0 64px;margin-top:auto;padding-top:26px;font-family:"LXGW WenKai Screen",serif;font-size:20px;
     line-height:1.8;color:%MUTED%;max-width:900px}
.foot{padding:20px 64px 0;display:flex;justify-content:space-between;font-size:12px;color:#8b92a0;letter-spacing:.02em}
</style></head><body><div class="wrap">
<div class="mark"><b>封面</b><span>%EYEBROW%</span><em>%COUNT%</em></div>
<div class="hd"><h1>%H1%</h1><div class="rule"></div></div>
<div class="hero"><img src="%IMG%" alt="%ALT%"><div class="bar"></div></div>
<div class="cap">%CAP%</div>
<p class="dek">%DEK%</p>
<div class="foot"><span>%FOOTL%</span><span>%FOOTR%</span></div>
</div></body></html>"""


def cover_html(*, title, h1_html, eyebrow, count, photo, alt="", cap="", dek="",
               foot_left="", foot_right="", kinds=("serif", "sans", "wenkai", "gara")):
    """拼出一页封面 HTML；photo 是必填——封面一律放一张配图，不做纯文字封面。"""
    path = Path(photo)
    if not path.exists():
        raise FileNotFoundError(f"封面配图不存在：{path}")
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    html = (HTML.replace("%W%", str(W)).replace("%H%", str(H))
                .replace("%HERO%", str(HERO_H)).replace("%TS%", str(TITLE_SIZE))
                .replace("%PAPER%", PAPER).replace("%SOFT%", SOFT)
                .replace("%ACCENT%", ACCENT).replace("%INK%", INK)
                .replace("%MUTED%", MUTED))
    html = (html.replace("%TITLE%", title)
                .replace("%EYEBROW%", eyebrow)
                .replace("%COUNT%", count)
                .replace("%H1%", h1_html)
                .replace("%DEK%", numspan(dek))
                .replace("%IMG%", "data:image/png;base64," + b64)
                .replace("%ALT%", alt)
                .replace("%CAP%", cap)
                .replace("%FOOTL%", foot_left)
                .replace("%FOOTR%", foot_right))
    return html.replace("%FONTS%", fontkit.build_css(html, kinds=tuple(kinds)))


def write_cover(fn, out=None, **kw):
    """封面写进 out/fn（默认跟 FIGKIT_OUT 走），返回路径。"""
    path = Path(out) if out else OUT
    path.mkdir(parents=True, exist_ok=True)
    html = cover_html(**kw)
    target = path / fn
    target.write_text(html, encoding="utf-8")
    print("wrote", fn, len(html) // 1024, "KB")
    return target
