import math
import re
from pathlib import Path

import os

import json

import fontkit

OUT = Path(os.environ.get("FIGKIT_OUT") or Path(__file__).resolve().parent)
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Style is data, not literals. Defaults below reproduce the current look;
# override any key by pointing FIGKIT_STYLE at a JSON file, or by dropping a
# style.json beside the output. Nothing here should be edited inline per article.
# ---------------------------------------------------------------------------
STYLE_DEFAULTS = {
    "page_width": 1080,
    "pad": "52px 64px 40px",
    "figure_min_width": 952,
    "paper": "#f5f5f5",
    "ink": "#2d3142",
    "muted": "#4f5d75",
    "soft": "#5a6580",
    "accent": "#bf4520",
    "accent_tint": "rgba(191,69,32,0.08)",
    "rule": "rgba(45,49,66,0.12)",
    "rule_solid": "#bfc0c0",
    "font_body": '"Noto Sans SC VF",sans-serif',
    "font_label": '"Noto Sans SC VF",sans-serif',
    "font_mark": '"Noto Serif SC VF",serif',
    "font_title": '"Huiwen Mincho",serif',
    "font_dek": '"LXGW WenKai Screen",serif',
    "font_num": '"EB Garamond",serif',
    "h1_size": 62,
    "h1_weight": 400,
    "h1_line": 1.2,
    "dek_size": 18.5,
    "dek_line": 1.92,
    "dek_width": 790,
    "callout_size": 26,
    "callout_line": 1.68,
    "callout_width": 800,
    "mark_size": 18,
    "label_size": 13,
    "legend_size": 12,
    "foot_size": 11,
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

CSS = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>%TITLE%</title>
<style>
%FONTS%
*{margin:0;padding:0;box-sizing:border-box}
body{width:%W%px;background:%PAPER%;color:%INK%;font-family:%FONTBODY%;font-weight:400;-webkit-font-smoothing:antialiased}
.wrap{width:%W%px;padding:%PAD%;display:flex;flex-direction:column}
.mark{display:flex;align-items:baseline;gap:16px;margin-bottom:26px}
.mark b{font-family:%FONTMARK%;font-weight:600;font-size:%MARKSIZE%px;letter-spacing:.08em}
.mark span{font-size:%LABELSIZE%px;color:%SOFT%;letter-spacing:.02em}
.mark i{flex:1;height:1px;background:%RULE14%;position:relative;top:-3px}
h1{font-family:%FONTTITLE%;font-weight:%H1W%;font-size:%H1SIZE%px;line-height:%H1L%;margin:0 0 16px;letter-spacing:0}
.dek{font-family:%FONTDEK%;font-weight:400;font-size:%DEKSIZE%px;line-height:%DEKLINE%;color:%MUTED%;max-width:%DEKW%px}
.figure{margin:38px 0 0;min-width:%FIGMIN%px;overflow-x:auto}
svg{display:block}
.legend{display:flex;gap:24px;align-items:center;margin-top:8px;font-size:%LEGSIZE%px;letter-spacing:.02em;color:%SOFT%;border-top:1px solid %RULE%;padding-top:12px}
.legend i{display:inline-block;width:10px;height:10px;margin-right:7px;vertical-align:middle}
.foot{margin-top:14px;display:flex;justify-content:space-between;font-size:%FOOTSIZE%px;letter-spacing:.02em;color:%FOOTCOLOR%}
.callout{margin:34px 0 0;padding-left:22px;border-left:2px solid %INK20%;font-family:%FONTTITLE%;font-weight:400;font-size:%CALLSIZE%px;line-height:%CALLLINE%;color:%INK%;max-width:%CALLW%px}
svg text.num{font-family:%FONTNUM%;font-feature-settings:"lnum" 1}
span.num{font-family:%FONTNUM%;font-feature-settings:"lnum" 1;font-size:1.04em;letter-spacing:0}
</style></head><body><div class="wrap">
<div class="mark"><b>%NUM%</b><span>%EYEBROW%</span><i></i></div>
<h1>%H1%</h1>
<p class="dek">%DEK%</p>
<div class="figure">%SVG%%CALLOUT%</div>
<div class="legend">%LEGEND%</div>
<div class="foot"><span>%SRC%</span><span>%TAG%</span></div>
</div></body></html>"""

CSS_TOKENS = {
    "%W%": str(STYLE["page_width"]),
    "%PAD%": STYLE["pad"],
    "%FIGMIN%": str(STYLE["figure_min_width"]),
    "%PAPER%": PAPER,
    "%INK%": INK,
    "%MUTED%": MUTED,
    "%SOFT%": SOFT,
    "%RULE%": "rgba(45,49,66,.12)",
    "%RULE14%": "rgba(45,49,66,.14)",
    "%INK20%": "rgba(45,49,66,.2)",
    "%FONTBODY%": STYLE["font_body"],
    "%FONTLABEL%": STYLE["font_label"],
    "%FONTMARK%": STYLE["font_mark"],
    "%FOOTCOLOR%": STYLE.get("foot_color", "#8b92a0"),
    "%FONTTITLE%": STYLE["font_title"],
    "%FONTDEK%": STYLE["font_dek"],
    "%FONTNUM%": STYLE["font_num"],
    "%H1SIZE%": str(STYLE["h1_size"]),
    "%H1W%": str(STYLE["h1_weight"]),
    "%H1L%": str(STYLE["h1_line"]),
    "%DEKSIZE%": str(STYLE["dek_size"]),
    "%DEKLINE%": str(STYLE["dek_line"]),
    "%DEKW%": str(STYLE["dek_width"]),
    "%CALLSIZE%": str(STYLE["callout_size"]),
    "%CALLLINE%": str(STYLE["callout_line"]),
    "%CALLW%": str(STYLE["callout_width"]),
    "%MARKSIZE%": str(STYLE["mark_size"]),
    "%LABELSIZE%": str(STYLE["label_size"]),
    "%LEGSIZE%": str(STYLE["legend_size"]),
    "%FOOTSIZE%": str(STYLE["foot_size"]),
}

CN_NUM = "一二三四五六七八九十"

NUM_NODE = re.compile(r"(<text\b[^>]*>)\s*(\u2212?[+\-]?[\d.,]+%?)\s*(</text>)")
SIZE_RE = re.compile(r'font-size="([\d.]+)"')


def numeric_face(svg):
    """Leave SVG labels alone: at 14px a 400-weight Garamond against 600-weight
    Chinese reads as synthetic bold and goes mushy. Arabic numerals earn the
    Garamond swap only at display size, in the h1 and dek (see `numspan`)."""
    return svg


DIGITS = re.compile(r"(\d[\d,]*(?:\.\d+)?(?:%|亿|万)?)")


def numspan(text):
    """Wrap number runs in display text so they set in EB Garamond."""
    return DIGITS.sub(lambda m: f'<span class="num">{m.group(1)}</span>', text)


def page(fn, title, eyebrow, h1, dek, svg, legend, src, tag, callout=""):
    block = f'<p class="callout">{callout}</p>' if callout else ""
    # figure number word: derived from the filename, so 20-figure sets work too
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
                .replace("%SVG%", numeric_face(svg))
                .replace("%CALLOUT%", block)
                .replace("%LEGEND%", legend)
                .replace("%SRC%", src)
                .replace("%TAG%", tag))
    html = html.replace("%FONTS%", fontkit.build_css(html, kinds=tuple(STYLE["font_kinds"])))
    (OUT / fn).write_text(html, encoding="utf-8")
    print("wrote", fn, len(html) // 1024, "KB")


# ---------------------------------------------------------------- 01 timeline
def timeline():
    W, H = 952, 440
    axis_y = 250
    left0, left1 = 110, 470      # 2016.01–2016.12（放大）
    right0, right1 = 500, 890    # 2023.0–2025.3（压缩）

    def xl(m):
        return left0 + (m / 12) * (left1 - left0)

    def xr(y):
        return right0 + ((y - 2023) / 2.3) * (right1 - right0)

    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="tl-title tl-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="tl-title">十二年，四次改口，一次落地</title>',
         '<desc id="tl-desc">2016 年四次表态集中在放大后的左段，2023 年文心一言与 2025 年账本在压缩后的右段，中间为断轴。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>']
    s.append(f'<line x1="{left0}" y1="{axis_y}" x2="{left1}" y2="{axis_y}" stroke="{INK}" stroke-width="1"/>')
    s.append(f'<line x1="{right0}" y1="{axis_y}" x2="{right1}" y2="{axis_y}" stroke="{INK}" stroke-width="1"/>')
    for dx in (0, 8):
        s.append(f'<line x1="{478+dx}" y1="{axis_y-8}" x2="{487+dx}" y2="{axis_y+8}" stroke="{MUTED}" stroke-width="1.4"/>')

    for x, lab in ((left0, "2016"), (right0, "2023"), (right1, "2025")):
        s.append(f'<line x1="{x}" y1="{axis_y-5}" x2="{x}" y2="{axis_y+5}" stroke="{MUTED}" stroke-width="1"/>')
        s.append(f'<text x="{x}" y="{axis_y+24}" text-anchor="middle" font-size="12" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">{lab}</text>')

    def event(x, side, name, sub, accent=False, size=14, row=0):
        r = 6 if accent else 4
        col = ACCENT if accent else INK
        s.append(f'<circle cx="{x:.0f}" cy="{axis_y}" r="{r}" fill="{col}"/>')
        if side == "up":
            s.append(f'<line x1="{x:.0f}" y1="{axis_y-r}" x2="{x:.0f}" y2="{axis_y-46}" stroke="{col if accent else MUTED}" stroke-width="1"/>')
            ny, sy = axis_y - 56, axis_y - 36
        else:
            off = row * 50
            s.append(f'<line x1="{x:.0f}" y1="{axis_y+r}" x2="{x:.0f}" y2="{axis_y+52+off}" stroke="{col if accent else MUTED}" stroke-width="1"/>')
            ny, sy = axis_y + 74 + off, axis_y + 94 + off
        s.append(f'<text x="{x:.0f}" y="{ny}" text-anchor="middle" font-size="{size}" font-weight="600" fill="{col}">{name}</text>')
        s.append(f'<text x="{x:.0f}" y="{sy}" text-anchor="middle" font-size="12" fill="{SOFT}">{sub}</text>')

    event(xl(5.0), "up", "06 联盟峰会", "下一幕＝人工智能")
    event(xl(8.4), "down", "08·09 两次表态", "亚布力演讲 ＋ 百度世界")
    event(xl(10.5), "down", "11 乌镇", "移动互联网时代结束", row=1)
    event(xr(2023.2), "up", "03 文心一言邀测", "比 ChatGPT 晚几个月")
    event(xr(2025.0), "down", "2025 账本", f"营收 {MINUS}3%　净利 {MINUS}76%", accent=True, size=16)

    s.append(f'<text x="{left0}" y="{axis_y-118}" font-size="11" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">左段　2016 全年放大</text>')
    s.append(f'<text x="{right0}" y="{axis_y-118}" font-size="11" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">右段　2023–2025 压缩</text>')
    s.append('</svg>')
    page("01-timeline.html",
         "图 01 · 十二年，四次改口，一次落地",
         "李彦宏「下一幕」十二年",
         "十二年，四次改口，一次落地",
         "2016 年他一年之内说了四次“下一幕”。方向一直没变，变的是账本的日期。",
         "".join(s),
         f'<span><i style="background:{INK}"></i>表态</span><span><i style="background:{ACCENT}"></i>账本（焦）</span><span>断轴＝时间跳空，两段比例不同</span>',
         "来源：公开报道；2025 财务数据转自财报与媒体报道",
         "1080 宽　时间轴", "从“下一幕”到落地，中间隔了七年，也隔了一本账。")


# ---------------------------------------------------------------- 02 waterfall
def waterfall():
    W, H = 952, 500
    base_y, top_y = 412, 56
    domain = 250
    k = (base_y - top_y) / domain

    def y(v):
        return base_y - v * k

    bars = [
        dict(x=112, w=120, role="total", name="2024 归母净利", val=233, focal=False),
        dict(x=312, w=120, role="delta", name="长期资产减值", val=-162, focal=True),
        dict(x=512, w=120, role="delta", name="其他变动", val=-15, focal=False),
        dict(x=712, w=120, role="total", name="2025 归母净利", val=56, focal=False),
    ]
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="wf-title wf-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="wf-title">233 亿怎么变成 56 亿</title>',
         '<desc id="wf-desc">2024 年归母净利 233 亿，经 162 亿资产减值与 15 亿其他变动，落到 2025 年的 56 亿。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>']
    for v in (0, 50, 100, 150, 200, 250):
        s.append(f'<line x1="88" y1="{y(v):.0f}" x2="880" y2="{y(v):.0f}" stroke="rgba(45,49,66,0.08)" stroke-width="0.8"/>')
        s.append(f'<text x="78" y="{y(v)+4:.0f}" text-anchor="end" font-size="11" fill="{MUTED}" font-family="Noto Sans SC VF, sans-serif">{v}</text>')
    s.append(f'<line x1="88" y1="{top_y}" x2="88" y2="{base_y}" stroke="rgba(45,49,66,0.25)" stroke-width="1"/>')
    s.append(f'<line x1="88" y1="{base_y}" x2="880" y2="{base_y}" stroke="rgba(45,49,66,0.25)" stroke-width="1"/>')
    s.append(f'<text x="86" y="{top_y-20}" font-size="10" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">亿元</text>')

    run = 0
    prev = prev_x = None
    for b in bars:
        if b["role"] == "total":
            run = b["val"]; y0, y1 = y(0), y(b["val"])
        else:
            y0, y1 = y(run), y(run + b["val"]); run += b["val"]
        top, bot = min(y0, y1), max(y0, y1)
        h = max(bot - top, 3)
        if b["role"] == "total":
            fill, stroke = "rgba(45,49,66,0.08)", INK
        elif b["focal"]:
            fill, stroke = ACCENT_TINT, ACCENT
        else:
            fill, stroke = PAPER, MUTED
        s.append(f'<rect x="{b["x"]}" y="{top:.0f}" width="{b["w"]}" height="{h:.0f}" fill="{fill}" stroke="{stroke}" stroke-width="1"'
                 f' data-role="{b["role"]}" data-value="{b["val"]}" data-name="{b["name"]}"/>')
        lab = f'{b["val"]}' if b["role"] == "total" else (f'+{b["val"]}' if b["val"] > 0 else f'{MINUS}{abs(b["val"])}')
        if b["role"] == "delta" and b["val"] < 0:
            s.append(f'<text x="{b["x"]+b["w"]/2}" y="{bot+19:.0f}" text-anchor="middle" font-size="14" font-weight="600" fill="{ACCENT if b["focal"] else MUTED}">{lab}</text>')
        else:
            s.append(f'<text x="{b["x"]+b["w"]/2}" y="{top-10:.0f}" text-anchor="middle" font-size="14" font-weight="600" fill="{ACCENT if b["focal"] else MUTED}">{lab}</text>')
        s.append(f'<text x="{b["x"]+b["w"]/2}" y="{base_y+26}" text-anchor="middle" font-size="13" font-weight="600" fill="{INK}">{b["name"]}</text>')
        if prev is not None:
            s.append(f'<line x1="{prev_x}" y1="{y(prev):.0f}" x2="{b["x"]}" y2="{y(prev):.0f}" stroke="rgba(45,49,66,0.55)" stroke-width="1" data-carry="{prev}"/>')
        prev, prev_x = run, b["x"] + b["w"]
    s.append(f'<text x="112" y="{base_y+58}" font-size="11" fill="{SOFT}">保守口径：2024 归母净利 233 亿元按同比 {MINUS}76% 反推，原文未直接给出</text>')
    s.append('</svg>')
    page("02-waterfall.html",
         "图 02 · 233 亿怎么变成 56 亿",
         "2025 年归母净利的桥",
         "233 亿怎么变成 56 亿",
         "方向是对的，回报是迟的。这张图就是“看对方向”和“当期拿到钱”之间的距离。",
         "".join(s),
         f'<span><i style="background:rgba(45,49,66,0.08);border:1px solid {INK}"></i>总额（锚）</span>'
         f'<span><i style="background:{PAPER};border:1px solid {MUTED}"></i>减少（空心＝权重）</span>'
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>焦：减值 162 亿</span>',
         "减值 162 亿元为公开报道口径；其余变动为残差",
         "1080 宽　瀑布　单位 亿元　同一尺度　233−162−15=56", "换电机和盖厂房，是两笔不同的账。")


# ---------------------------------------------------------------- 03 layers
def layers():
    W, H = 952, 540
    rows = [
        ("L5", "组织", "智能组织＝新厂房", "4300 Workspace · 2 万 Skill", True),
        ("L4", "体", "智能体与应用", "DAA 0.5 万 → 3.7 万", False),
        ("L3", "模", "模型与推理", "每任务 token 更多，账单降得慢", False),
        ("L2", "云", "算力与调度", "同性能模型约每年降到 1/10", False),
        ("L1", "芯", "芯片与基础设施", "十年形成的四层之一", False),
        ("L0", "电", "能源＝新电能", "上游是能源，下游是组织", False),
    ]
    x, w, h, y0 = 96, 800, 72, 34
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="ly-title ly-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="ly-title">四层技术栈之上，还缺一层组织</title>',
         '<desc id="ly-desc">从能源到组织共六层，组织层为焦点。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>']
    for i, (tag, name, sub, note, focal) in enumerate(rows):
        y = y0 + i * h
        fill = ACCENT_TINT if focal else ("rgba(45,49,66,0.03)" if i % 2 == 0 else PAPER)
        stroke = ACCENT if focal else RULE
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
        s.append(f'<text x="{x+18}" y="{y+h/2+5}" font-size="12" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">{tag}</text>')
        s.append(f'<text x="{x+62}" y="{y+h/2+10}" font-size="26" font-weight="600" fill="{ACCENT if focal else INK}">{name}</text>')
        s.append(f'<text x="{x+134}" y="{y+h/2+8}" font-size="17" fill="{ACCENT if focal else MUTED}">{sub}</text>')
        s.append(f'<text x="{x+w-18}" y="{y+h/2+7}" text-anchor="end" font-size="12" fill="{SOFT}">{note}</text>')
    s.append(f'<line x1="64" y1="{y0+8}" x2="64" y2="{y0+h*6-8}" stroke="{MUTED}" stroke-width="1"/>')
    s.append(f'<path d="M58 {y0+18} L64 {y0+8} L70 {y0+18}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
    s.append(f'<text x="50" y="{y0+h*3}" font-size="11" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif" text-anchor="middle" transform="rotate(-90 50 {y0+h*3})">能力 ↑　供给 ↓</text>')
    s.append(f'<text x="{x}" y="{H-18}" font-size="13" fill="{SOFT}">只换电机（L3 以下）不重建工厂（L5），就是 Token 花得越来越多、利润没动的那个状态。</text>')
    s.append('</svg>')
    page("03-layers.html",
         "图 03 · 四层技术栈之上，还缺一层组织",
         "芯、云、模、体、组织",
         "他只换了电机，没重建工厂",
         "技术栈十年前就成型了。真正没变的是最上面那一层——组织的形状。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>焦：组织层</span>'
         f'<span><i style="background:rgba(45,49,66,0.03);border:1px solid {RULE}"></i>技术层</span>'
         f'<span>箭头＝能力上行、供给下行</span>',
         "层内数字为百度自述口径，未独立核实",
         "1080 宽　层叠　六层", "Token 花得越来越多，收入利润没有跟着涨。")


# ---------------------------------------------------------------- 04 loop
def _rect_circle(cx, cy, R, x0, y0, x1, y1):
    pts = []
    for xe in (x0, x1):
        dx = xe - cx
        if abs(dx) <= R:
            dy = math.sqrt(R * R - dx * dx)
            for ye in (cy - dy, cy + dy):
                if y0 <= ye <= y1:
                    pts.append((xe, ye))
    for ye in (y0, y1):
        dy = ye - cy
        if abs(dy) <= R:
            dx = math.sqrt(R * R - dy * dy)
            for xe in (cx - dx, cx + dx):
                if x0 <= xe <= x1:
                    pts.append((xe, ye))
    return pts


def loop():
    W, H = 952, 640
    cx, cy, R = 476, 330, 252
    sw, sh, hw, hh = 172, 76, 200, 100
    stations = [
        ("01", "定标准", "可衡量的“好”", True),
        ("02", "派任务", "以任务为中心", False),
        ("03", "做出来", "人 ＋ 智能体", False),
        ("04", "记结果", "出错率·耗时·成本", False),
        ("05", "改标准", "按结果循环", False),
    ]
    n = len(stations)
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="lp-title lp-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="lp-title">可衡量 + Looping ＝ 持续进化</title>',
         '<desc id="lp-desc">五个工序沿同一圈顺时针推进，每轮把结果写回中央的组织账本。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>',
         '<defs><marker id="lp-ar" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">'
         f'<path d="M0 0 L9 4 L0 8" fill="none" stroke="{MUTED}" stroke-width="1.3"/></marker></defs>']

    geo = []
    for i in range(n):
        th = math.radians(-90 + i * (360 / n))
        pcx, pcy = cx + R * math.cos(th), cy + R * math.sin(th)
        x0, y0 = pcx - sw / 2, pcy - sh / 2
        pts = _rect_circle(cx, cy, R, x0, y0, x0 + sw, y0 + sh)
        angs = []
        for (px, py) in pts:
            a = math.atan2(py - cy, px - cx)
            while a < 0:
                a += 2 * math.pi
            angs.append((a, px, py))
        angs.sort()
        theta = th
        while theta < 0:
            theta += 2 * math.pi
        # exit = first point clockwise after theta, entry = last point before theta
        after = [t for t in angs if t[0] > theta]
        before = [t for t in angs if t[0] <= theta]
        exit_p = after[0] if after else angs[0]
        entry_p = before[-1] if before else angs[-1]
        geo.append(dict(c=(pcx, pcy), th=th, exit=exit_p, entry=entry_p, box=(x0, y0)))

    overhang = math.radians(1.6 / R * 180 / math.pi * 0.0 + 1.6 / R)  # ~1.6px at radius
    for i in range(n):
        a = geo[i]["exit"]
        b = geo[(i + 1) % n]["entry"]
        end_ang = b[0] - overhang
        ex, ey = cx + R * math.cos(end_ang), cy + R * math.sin(end_ang)
        s.append(f'<path d="M {a[1]:.2f} {a[2]:.2f} A {R} {R} 0 0 1 {ex:.2f} {ey:.2f}" stroke="{MUTED}" '
                 'stroke-width="1.3" fill="none" marker-end="url(#lp-ar)"/>')

    # dashed spokes
    for i in range(n):
        th = geo[i]["th"]
        ux, uy = math.cos(th), math.sin(th)
        d_st = min(sw / 2 / abs(ux) if ux else 1e9, sh / 2 / abs(uy) if uy else 1e9)
        d_hub = min(hw / 2 / abs(ux) if ux else 1e9, hh / 2 / abs(uy) if uy else 1e9)
        s.append(f'<line x1="{geo[i]["c"][0]-d_st*ux:.1f}" y1="{geo[i]["c"][1]-d_st*uy:.1f}" '
                 f'x2="{cx+(d_hub+6)*ux:.1f}" y2="{cy+(d_hub+6)*uy:.1f}" stroke="{SOFT}" stroke-width="1" stroke-dasharray="5,4"/>')

    # stations
    for i, (num, name, sub, focal) in enumerate(stations):
        x0, y0 = geo[i]["box"]
        s.append(f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{sw}" height="{sh}" fill="{ACCENT_TINT if focal else PAPER}" '
                 f'stroke="{ACCENT if focal else INK}" stroke-width="1" rx="2"/>')
        s.append(f'<text x="{x0+16:.0f}" y="{y0+22:.0f}" font-size="10" fill="{SOFT}" font-family="Noto Sans SC VF, sans-serif">{num}</text>')
        s.append(f'<text x="{x0+16:.0f}" y="{y0+46:.0f}" font-size="19" font-weight="600" fill="{ACCENT if focal else INK}">{name}</text>')
        s.append(f'<text x="{x0+16:.0f}" y="{y0+64:.0f}" font-size="10.5" fill="{SOFT}">{sub}</text>')

    s.append(f'<rect x="{cx-hw/2}" y="{cy-hh/2}" width="{hw}" height="{hh}" fill="{INK}" rx="2"/>')
    s.append(f'<text x="{cx}" y="{cy-2}" text-anchor="middle" font-size="19" font-weight="600" fill="{PAPER}">组织账本</text>')
    s.append(f'<text x="{cx}" y="{cy+22}" text-anchor="middle" font-size="11.5" fill="#c9ccd6">2 万个已沉淀 Skill</text>')
    s.append('</svg>')
    page("04-loop.html",
         "图 04 · 可衡量 + Looping ＝ 持续进化",
         "组织进化的第三条原则",
         "可衡量 + Looping ＝ 持续进化",
         "他说这是第三条原则。我看它是整圈里唯一不能外包的一步——标准谁定，责任就归谁。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>焦：定标准</span>'
         f'<span><i style="background:{PAPER};border:1px solid {INK}"></i>工序</span>'
         f'<span><i style="background:{INK}"></i>中央账本</span>'
         f'<span>虚线＝每轮回写</span>',
         "五道工序按“以任务为中心”改写自他的三条原则",
         "1080 宽　闭环　五站一环", "可衡量，正是验证的前提。")


# ---------------------------------------------------------------- 05 quadrant
def quadrant():
    W, H = 952, 552
    cx, cy = 476, 286
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="qd-title qd-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="qd-title">冲击落在哪一格</title>',
         '<desc id="qd-desc">横轴是 AI 的作用，纵轴是资历；就业下降集中在替代型加入门这一格。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>',
         '<defs><marker id="qd-a" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">'
         f'<path d="M0 0 L9 4 L0 8" fill="none" stroke="{INK}" stroke-width="1.2"/></marker>'
         '<marker id="qd-b" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">'
         f'<path d="M0 0 L9 4 L0 8" fill="none" stroke="{INK}" stroke-width="1.2"/></marker></defs>']
    s.append(f'<line x1="96" y1="{cy}" x2="852" y2="{cy}" stroke="{INK}" stroke-width="1.2" marker-start="url(#qd-b)" marker-end="url(#qd-a)"/>')
    s.append(f'<line x1="{cx}" y1="70" x2="{cx}" y2="{cy+206}" stroke="{INK}" stroke-width="1.2" marker-start="url(#qd-b)" marker-end="url(#qd-a)"/>')
    s.append(f'<text x="86" y="{cy+4}" text-anchor="end" font-size="13" fill="{MUTED}" font-family="Noto Sans SC VF, sans-serif">替代</text>')
    s.append(f'<text x="862" y="{cy+4}" font-size="13" fill="{MUTED}" font-family="Noto Sans SC VF, sans-serif">辅助</text>')
    s.append(f'<text x="{cx+12}" y="64" font-size="13" fill="{MUTED}" font-family="Noto Sans SC VF, sans-serif">资深</text>')
    s.append(f'<text x="{cx+12}" y="{cy+222}" font-size="13" fill="{MUTED}" font-family="Noto Sans SC VF, sans-serif">入门</text>')

    items = [
        (320, 430, "22–25 岁／替代型", f"{MINUS}19%（招聘减少，非裁员）", True),
        (648, 424, "22–25 岁／辅助型", "持平或上升", False),
        (306, 150, "替代型／资深", "降幅不如入门明显", False),
        (666, 156, "默会知识／中高年资", "就业增长更强", False),
    ]
    for x, y, name, sub, focal in items:
        s.append(f'<circle cx="{x}" cy="{y}" r="{6 if focal else 4}" fill="{ACCENT if focal else MUTED}"/>')
        s.append(f'<text x="{x+14}" y="{y-4}" font-size="15" font-weight="600" fill="{ACCENT if focal else INK}">{name}</text>')
        s.append(f'<text x="{x+14}" y="{y+16}" font-size="12" fill="{SOFT}">{sub}</text>')
    s.append('</svg>')
    page("05-quadrant.html",
         "图 05 · 冲击落在哪一格",
         "斯坦福的四条发现",
         "冲击并不均匀，落在这一格",
         "同一个技术冲击，落在不同格子里的力道差 19 个百分点。招聘在缩，裁员没增。",
         "".join(s),
         f'<span><i style="background:{ACCENT}"></i>焦：下降最明显</span>'
         f'<span><i style="background:{MUTED}"></i>其他观察点</span>'
         f'<span>点是定性落位，非连续刻度</span>',
         "数据：斯坦福数字经济实验室（2026-08 更新，截至 2026-06）；全经济范围未发现大规模岗位流失；研究者自述为描述性迹象",
         "1080 宽　象限　两轴为定性分类", "招聘在缩，裁员没增——冲击先落在门口。")


# ---------------------------------------------------------------- 06 steps
def steps():
    W, H = 952, 336
    items = [
        ("01", "写清标准", ["报价单核对哪几项、", "允许多大误差"], True),
        ("02", "审核并记账", ["记录出错率、耗时、成本", "——这本身就是证据"], False),
        ("03", "攒默会判断", ["在具体领域攒下", "说不清、写不下的判断"], False),
        ("04", "在结果上署名", ["责任落在部署方", "企业要能签字的人"], False),
        ("05", "用项目当证据", ["入门岗位在减少", "带指标的小项目顶上"], False),
    ]
    n = len(items)
    stage_w = 176
    start_x = (W - n * stage_w) / 2
    rail_y, rail_h = 60, 34
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="sp-title sp-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="sp-title">普通人能做的五件事</title>',
         '<desc id="sp-desc">五道等宽工序排在同一条轨道上，第一步“写清标准”是本图的焦点。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>']
    for i, (num, title, desc, focal) in enumerate(items):
        x = start_x + i * stage_w
        # one uniform rail tint; the focal stage is the only thing that changes colour,
        # so the order reads left-to-right instead of as an alternating stripe.
        fill = ACCENT_TINT if focal else "rgba(45,49,66,0.05)"
        s.append(f'<rect x="{x:.0f}" y="{rail_y}" width="{stage_w}" height="{rail_h}" fill="{fill}" stroke="none" '
                 f'data-role="rail" data-step="{num}" data-index="{i+1}"'
                 + (' data-focal="true"' if focal else '') + '/>')
        if focal:
            s.append(f'<line x1="{x:.0f}" y1="{rail_y}" x2="{x+stage_w}" y2="{rail_y}" stroke="{ACCENT}" stroke-width="1"/>')
            s.append(f'<line x1="{x:.0f}" y1="{rail_y+rail_h}" x2="{x+stage_w}" y2="{rail_y+rail_h}" stroke="{ACCENT}" stroke-width="1"/>')
        cxx = x + stage_w / 2
        # the two-digit index sits inside the token: a hollow ring with the number
        # outside reads as an unselected radio button, which is the wrong idea.
        s.append(f'<circle cx="{cxx:.0f}" cy="{rail_y+rail_h/2}" r="17" fill="{PAPER}" '
                 f'stroke="{ACCENT if focal else INK}" stroke-width="1" data-role="medallion" data-step="{num}"'
                 + (' data-focal="true"' if focal else '') + '/>')
        s.append(f'<text x="{cxx:.0f}" y="{rail_y+rail_h/2+7}" text-anchor="middle" font-size="17" font-weight="600" '
                 f'fill="{ACCENT if focal else INK}" font-family="EB Garamond, serif" '
                 f'font-feature-settings="lnum" data-role="number" data-step="{num}">{num}</text>')
        s.append(f'<text x="{cxx:.0f}" y="164" text-anchor="middle" font-size="21" font-weight="600" fill="{ACCENT if focal else INK}">{title}</text>')
        for j, line in enumerate(desc):
            s.append(f'<text x="{cxx:.0f}" y="{194+j*24}" text-anchor="middle" font-size="13.5" fill="{SOFT}">{line}</text>')
    s.append(f'<line x1="{start_x:.0f}" y1="284" x2="{start_x+n*stage_w:.0f}" y2="284" stroke="{RULE}" stroke-width="1"/>')
    s.append(f'<text x="{start_x:.0f}" y="312" font-size="13" fill="{SOFT}">间距只表示顺序，不表示耗时；这五条是作者的推断，未被验证。</text>')
    s.append('</svg>')
    page("06-steps.html",
         "图 06 · 普通人能做的五件事",
         "作者的推断，未被验证",
         "普通人能做的五件事",
         "不是“学 AI”，是把自己变成那个能定义“好”、能在结果上签字的人。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border-top:1px solid {ACCENT}"></i>焦：写清标准</span>'
         f'<span><i style="background:rgba(45,49,66,0.05)"></i>其余四步</span>'
         f'<span>字号已为 1080 卡片放大，非文档级原尺寸</span>',
         "内容：原文第 5 节“对普通人意味着什么”，属作者推断",
         "1080 宽　步骤　原文第五节", "能定义“好”的人，才能判断 AI 做得对不对。")


# ------------------------------------------------------- 07 architecture delta
def delta():
    W, H = 952, 470
    s = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
         f'aria-labelledby="ad-title ad-desc" font-family="Noto Sans SC VF, sans-serif">',
         '<title id="ad-title">组织账本：从按岗位记账到按任务记账</title>',
         '<desc id="ad-desc">左边是今天的岗位链路，右边是换成任务与 Skill 库之后的链路，底下一行是三项具体变化。</desc>',
         f'<rect width="100%" height="100%" fill="{PAPER}"/>']

    # panel captions
    s.append(f'<text x="40" y="38" font-size="13" font-weight="600" fill="{MUTED}">现在</text>'
             f'<text x="40" y="60" font-size="12" fill="{SOFT}">按岗位记账，考核落在部门</text>')
    s.append(f'<text x="520" y="38" font-size="13" font-weight="600" fill="{INK}">目标</text>'
             f'<text x="520" y="60" font-size="12" fill="{SOFT}">按任务记账，考核落在签名</text>')

    def node(x, y, w, h, name, sub, dark=False, focal=False):
        out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{PAPER}"/>']
        fill = INK if dark else (ACCENT_TINT if focal else PAPER)
        stroke = ACCENT if focal else (INK if dark else MUTED)
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
        name_fill = PAPER if dark else (ACCENT if focal else INK)
        out.append(f'<text x="{x+18}" y="{y+26}" font-size="16" font-weight="600" fill="{name_fill}">{name}</text>')
        out.append(f'<text x="{x+18}" y="{y+47}" font-size="11.5" fill="{PAPER if dark else SOFT}">{sub}</text>')
        return out

    def vlink(x, y1, y2):
        return (f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" stroke="{MUTED}" stroke-width="1" '
                f'marker-end="url(#arrow)"/>')

    s.append('<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" '
             f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker></defs>')

    lx, rx, nw, nh = 40, 520, 352, 60
    s.append(vlink(lx + nw / 2, 136, 160))
    s.append(vlink(lx + nw / 2, 220, 244))
    s.append(vlink(rx + nw / 2, 136, 160))
    s.append(vlink(rx + nw / 2, 220, 244))

    s += node(lx, 76, nw, nh, "岗位", "入职即定级，职责写进 JD，一年一评")
    s += node(lx, 160, nw, nh, "部门指标", "KPI 拆到部门，再由部门往下拆")
    s += node(lx, 244, nw, nh, "年度评审", "看的是本部门当期完成率")

    s += node(rx, 76, nw, nh, "任务", "以一次可验收的活为单位，谁做谁留名")
    s += node(rx, 160, nw, nh, "Skill 库", "2 万条，做法被复用过才算数")
    s += node(rx, 244, nw, nh, "组织账本", "4300 个 Workspace 共用同一本账", dark=True)

    # the one focal mark: what the ledger actually changes
    s.append(f'<text x="{rx+18}" y="332" font-size="12" fill="{ACCENT}">记账对象从“人”换成“一次任务”</text>')

    # changes ledger
    s.append(f'<line x1="40" y1="356" x2="912" y2="356" stroke="{RULE}" stroke-width="1"/>')
    rows = [
        ("计量单位", "岗位", "一次任务"),
        ("沉淀物", "流程文档", "Skill 库"),
        ("追责", "部门 KPI", "结果上的签名"),
    ]
    for i, (k, a, b) in enumerate(rows):
        y = 384 + i * 30
        s.append(f'<text x="40" y="{y}" font-size="12" fill="{SOFT}">{k}</text>')
        s.append(f'<text x="128" y="{y}" font-size="13.5" fill="{MUTED}">{a}</text>')
        s.append(f'<text x="248" y="{y}" font-size="13" fill="{RULE_SOLID}">→</text>')
        s.append(f'<text x="284" y="{y}" font-size="13.5" fill="{INK}">{b}</text>')

    s.append('</svg>')
    page("07-delta.html",
         "图 07 · 组织账本前后拓扑",
         "变化只有三处，但都在账上",
         "换的不是工具，是记账对象",
         "同样一套模型，记在岗位上还是记在任务上，决定它一年后是省钱还是变成一笔糊涂账。",
         "".join(s),
         f'<span><i style="background:{INK}"></i>累积状态（组织账本）</span>'
         f'<span><i style="background:{PAPER};border:1px solid {MUTED}"></i>普通环节</span>'
         f'<span>箭头只有一个方向：数据往下沉，责任往上收</span>',
         "图中数字：4300 个 Workspace、2 万条 Skill 来自公开报道；左侧链路为作者的归纳，非原文直述",
         "1080 宽　架构变化　前后同尺度", "记账对象一变，其余三件事都要跟着变。")


if __name__ == "__main__":
    timeline()
    waterfall()
    layers()
    loop()
    quadrant()
    steps()
    delta()
    print("all done")
