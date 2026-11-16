# -*- coding: utf-8 -*-
"""3:4 竖版页壳（1080×1440）：页高固定 1440，图内坐标宽 952。

横向页壳在 `make.py`（1080×800 那套）。这一份专门解决手机画幅——**不是把横图塞进竖画布**，
而是换一套纵向构图：页高从 800 拉到 1440，图的可用宽只有 952，纵向图型的形态词典见
`references/size-3x4.md`。

用法（在文章工作目录里）::

    import os, sys
    from pathlib import Path
    HERE = Path(__file__).resolve().parent
    sys.path.insert(0, r"<repo>/skills/article-figures/scripts")
    os.environ.setdefault("FIGKIT_OUT", str(HERE / "out"))
    from shell34 import PAGE_H, PAPER, W, arrow_defs, line, open_svg, page, txt

页壳只管版式，图型函数由文章自己的 make 脚本写；**跨篇只复用图型函数，不复用某篇的文案**。

`page()` 九个参数、没有 `src`：页脚左下那句「原文｜…」2026-11-16 按用户要求删掉了，
诚实交代（口径、推断、残差）一律搬进 SVG 图注或正文，不靠页脚小字。
"""
import os
import re
import json
from pathlib import Path

import fontkit

OUT = Path(os.environ.get("FIGKIT_OUT") or Path(__file__).resolve().parent)
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 样式是数据，不是字面量。默认值就是这套 3:4 的样子；
# 改样式给 FIGKIT_STYLE 指一个 JSON，或在输出目录放 style.json，不要改本文件的数字。
# ---------------------------------------------------------------------------
STYLE_DEFAULTS = {
    # 画幅：3:4 = 1080×1440，小红书与抖音图文同规格
    "page_width": 1080,
    "page_height": 1440,
    "pad": "74px 64px 56px",
    "figure_width": 952,           # 页宽 1080 减左右各 64，图内坐标就按这个宽画
    "paper": "#f5f5f5",
    "ink": "#2d3142",
    "muted": "#4f5d75",
    "soft": "#5a6580",
    "accent": "#bf4520",
    "accent_tint": "rgba(191,69,32,0.08)",
    "rule": "rgba(45,49,66,0.12)",
    "rule_solid": "#bfc0c0",
    "font_body": '"Noto Sans SC VF",sans-serif',
    "font_mark": '"Noto Serif SC VF",serif',
    "font_title": '"Huiwen Mincho",serif',
    "font_dek": '"LXGW WenKai Screen",serif',
    "font_num": '"EB Garamond",serif',
    "foot_color": "#8b92a0",
    # 竖版字号比横版大一档：手机屏上看，70px 的 h1 只相当于横版 62px 的观感
    "h1_size": 70,
    "h1_weight": 400,
    "h1_line": 1.16,
    "mark_size": 19,
    "label_size": 14,
    "mark_margin": 30,
    "dek_size": 21,
    "dek_line": 1.82,
    "dek_width": 900,
    "figure_margin": 44,
    "legend_gap": 22,
    "legend_size": 13,
    "foot_size": 12,
    "callout_size": 31,
    "callout_line": 1.6,
    "callout_width": 880,
    "font_kinds": ["sans", "wenkai", "gara", "huiwen"],
}


def load_style():
    path = os.environ.get("FIGKIT_STYLE")
    cand = Path(path) if path else OUT / "style.json"
    style = dict(STYLE_DEFAULTS)
    if cand.exists():
        style.update(json.loads(cand.read_text(encoding="utf-8")))
        print("style:", cand)
    return style


STYLE = load_style()
PAPER = STYLE["paper"]
INK = STYLE["ink"]
MUTED = STYLE["muted"]
SOFT = STYLE["soft"]
ACCENT = STYLE["accent"]
ACCENT_TINT = STYLE["accent_tint"]
RULE = STYLE["rule"]
RULE_SOLID = STYLE["rule_solid"]
MINUS = "\u2212"

W = STYLE["figure_width"]          # 图内坐标宽（页面 1080，左右各留 64）
PAGE_H = STYLE["page_height"]      # 页高固定，图片按 1080×1440 出

CSS = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>%TITLE%</title>
<style>
%FONTS%
*{margin:0;padding:0;box-sizing:border-box}
body{width:%W%px;min-height:%H%px;background:%PAPER%;color:%INK%;font-family:%FONTBODY%;-webkit-font-smoothing:antialiased}
.wrap{width:%W%px;min-height:%H%px;padding:%PAD%;display:flex;flex-direction:column}
.mark{display:flex;align-items:baseline;gap:16px;margin-bottom:%MARKMB%px}
.mark b{font-family:%FONTMARK%;font-weight:600;font-size:%MARKSIZE%px;letter-spacing:.08em}
.mark span{font-size:%LABELSIZE%px;color:%SOFT%;letter-spacing:.02em}
.mark i{flex:1;height:1px;background:%RULE14%;position:relative;top:-3px}
h1{font-family:%FONTTITLE%;font-weight:%H1W%;font-size:%H1SIZE%px;line-height:%H1L%;margin:0 0 18px}
.dek{font-family:%FONTDEK%;font-size:%DEKSIZE%px;line-height:%DEKLINE%;color:%MUTED%;max-width:%DEKW%px}
.figure{margin:%FIGMT%px 0 0;overflow:hidden}
svg{display:block}
.legend{display:flex;gap:%LEGGAP%px;align-items:center;margin-top:10px;font-size:%LEGSIZE%px;letter-spacing:.02em;color:%SOFT%;border-top:1px solid %RULE%;padding-top:14px}
.legend i{display:inline-block;width:11px;height:11px;margin-right:7px;vertical-align:middle}
.foot{margin-top:14px;display:flex;justify-content:flex-end;font-size:%FOOTSIZE%px;letter-spacing:.02em;color:%FOOTCOLOR%}
.callout{margin:34px 0 0;padding-left:26px;border-left:3px solid %INK20%;font-family:%FONTTITLE%;font-size:%CALLSIZE%px;line-height:%CALLLINE%;max-width:%CALLW%px}
svg text.num,span.num{font-family:%FONTNUM%;font-feature-settings:"lnum" 1}
</style></head><body><div class="wrap">
<div class="mark"><b>%NUM%</b><span>%EYEBROW%</span><i></i></div>
<h1>%H1%</h1>
<p class="dek">%DEK%</p>
<div class="figure">%SVG%%CALLOUT%</div>
<div class="legend">%LEGEND%</div>
<div class="foot"><span></span><span>%TAG%</span></div>
</div></body></html>"""

CSS_TOKENS = {
    "%W%": str(STYLE["page_width"]),
    "%H%": str(STYLE["page_height"]),
    "%PAD%": STYLE["pad"],
    "%PAPER%": PAPER,
    "%INK%": INK,
    "%MUTED%": MUTED,
    "%SOFT%": SOFT,
    "%RULE%": RULE,
    "%RULE14%": "rgba(45,49,66,.14)",
    "%INK20%": "rgba(45,49,66,.2)",
    "%FONTBODY%": STYLE["font_body"],
    "%FONTMARK%": STYLE["font_mark"],
    "%FONTTITLE%": STYLE["font_title"],
    "%FONTDEK%": STYLE["font_dek"],
    "%FONTNUM%": STYLE["font_num"],
    "%FOOTCOLOR%": STYLE["foot_color"],
    "%H1SIZE%": str(STYLE["h1_size"]),
    "%H1W%": str(STYLE["h1_weight"]),
    "%H1L%": str(STYLE["h1_line"]),
    "%MARKSIZE%": str(STYLE["mark_size"]),
    "%LABELSIZE%": str(STYLE["label_size"]),
    "%MARKMB%": str(STYLE["mark_margin"]),
    "%DEKSIZE%": str(STYLE["dek_size"]),
    "%DEKLINE%": str(STYLE["dek_line"]),
    "%DEKW%": str(STYLE["dek_width"]),
    "%FIGMT%": str(STYLE["figure_margin"]),
    "%LEGGAP%": str(STYLE["legend_gap"]),
    "%LEGSIZE%": str(STYLE["legend_size"]),
    "%FOOTSIZE%": str(STYLE["foot_size"]),
    "%CALLSIZE%": str(STYLE["callout_size"]),
    "%CALLLINE%": str(STYLE["callout_line"]),
    "%CALLW%": str(STYLE["callout_width"]),
}

CN_NUM = "一二三四五六七八九十"
DIGITS = re.compile(r"(\d[\d,]*(?:\.\d+)?(?:%|亿|万)?)")


def numspan(text):
    """把数字串包一层，让它排 EB Garamond。

    注意：含 HTML 标签的字符串不要过这个函数——正则会把 `class="l3"` 里的 3 也包进去，
    标题会渲染成 `3">…`。标题行里有 <span> 就自己拼，别走 numspan。
    """
    return DIGITS.sub(lambda m: f'<span class="num">{m.group(1)}</span>', text)


def page(fn, title, eyebrow, h1, dek, svg, legend, tag, callout=""):
    """写一页 1080×1440 竖版 HTML。

    fn       输出文件名，图序号由文件名数字推出（01-… → 图一）
    legend   底部图例（横条，色块 + 文字）
    tag      右下角小字，写画幅与图型（如「1080×1440　纵向列条」）
    """
    block = f'<p class="callout">{callout}</p>' if callout else ""
    digits = re.match(r"(\d+)", fn)
    num = "图" + (CN_NUM[int(digits.group(1)) - 1] if digits and int(digits.group(1)) <= 10
                  else f"{int(digits.group(1)):02d}" if digits else "")
    base = CSS
    for k, v in CSS_TOKENS.items():
        base = base.replace(k, v)
    html = (base.replace("%TITLE%", title)
                .replace("%NUM%", num)
                .replace("%EYEBROW%", eyebrow)
                .replace("%H1%", numspan(h1))
                .replace("%DEK%", numspan(dek))
                .replace("%SVG%", svg)
                .replace("%CALLOUT%", block)
                .replace("%LEGEND%", legend)
                .replace("%TAG%", tag))
    html = html.replace("%FONTS%", fontkit.build_css(html, kinds=tuple(STYLE["font_kinds"])))
    (OUT / fn).write_text(html, encoding="utf-8")
    print("wrote", fn, len(html) // 1024, "KB")


# --------------------------------------------------------------- svg 小工具
# 竖版页的图自己铺满 952 宽、高度由各图型定；这三件事横竖一样，所以搬进页壳共用。
def open_svg(h, title, desc):
    """开一张 952×h 的 SVG，纸色底铺满（不铺会露出页面白色，成比页面更亮的方块）。"""
    return [f'<svg viewBox="0 0 {W} {h}" width="{W}" height="{h}" role="img" '
            f'aria-labelledby="t d" font-family="Noto Sans SC VF, sans-serif">',
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>',
            f'<rect width="100%" height="100%" fill="{PAPER}"/>']


def txt(x, y, s, size=15, fill=INK, weight=400, anchor="start", family=None, track=None):
    fam = f' font-family="{family}"' if family else ""
    wt = f' font-weight="{weight}"' if weight != 400 else ""
    ls = f' letter-spacing="{track}"' if track else ""
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}"{wt}{ls}{fam} '
            f'text-anchor="{anchor}">{s}</text>')


def line(x1, y1, x2, y2, col=RULE_SOLID, w=1.2, marker=None):
    mk = f' marker-end="url(#{marker})"' if marker else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="{w}"{mk}/>'


def arrow_defs():
    """三支箭头：ar 灰、ar-ink 墨、ar-acc 朱红。一个 SVG 里引一次就够。"""
    return ('<defs>'
            f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{MUTED}"/></marker>'
            f'<marker id="ar-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{INK}"/></marker>'
            f'<marker id="ar-acc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{ACCENT}"/></marker>'
            '</defs>')
