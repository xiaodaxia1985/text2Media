"""黄仁勋这篇的 10 张图。

复用的是 article-figures skill 的页面外壳（page / CSS / STYLE），只写这篇的图型函数。
页面顺序与 plan 的 pages 一一对应：01-event … 10-truth。
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _skill_scripts():
    """找 skill 的 scripts 目录：环境变量优先，其次从仓库根按相对路径找。"""
    env = os.environ.get("ARTICLE_FIGURES_DIR")
    if env:
        return Path(env)
    for parent in HERE.parents:
        cand = parent / "skills" / "article-figures" / "scripts"
        if cand.is_dir():
            return cand
    raise SystemExit("找不到 article-figures/scripts，请设置 ARTICLE_FIGURES_DIR")


SKILL = _skill_scripts()
sys.path.insert(0, str(SKILL))
os.environ.setdefault("FIGKIT_OUT", str(HERE / "out"))

import make as shell  # noqa: E402

PAPER, INK, MUTED, SOFT = shell.PAPER, shell.INK, shell.MUTED, shell.SOFT
ACCENT, ACCENT_TINT = shell.ACCENT, shell.ACCENT_TINT
RULE, RULE_SOLID = shell.RULE, shell.RULE_SOLID
page = shell.page

W = 952


def head(w, h, title, desc):
    return (f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="fig-title fig-desc">'
            f'<title id="fig-title">{title}</title><desc id="fig-desc">{desc}</desc>'
            f'<defs><marker id="ar" viewBox="0 0 9 8" refX="8" refY="4" markerWidth="7" markerHeight="6" orient="auto">'
            f'<path d="M0 0 L9 4 L0 8" fill="none" stroke="{MUTED}" stroke-width="1.3"/></marker>'
            f'<marker id="ar-acc" viewBox="0 0 9 8" refX="8" refY="4" markerWidth="7" markerHeight="6" orient="auto">'
            f'<path d="M0 0 L9 4 L0 8" fill="none" stroke="{ACCENT}" stroke-width="1.3"/></marker></defs>'
            f'<rect width="100%" height="100%" fill="{PAPER}"/>')


def txt(x, y, s, size=13, fill=INK, anchor="start", weight=None, ls=None, family=None):
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    w = f' font-weight="{weight}"' if weight else ""
    l = f' letter-spacing="{ls}"' if ls else ""
    f = f' font-family="{family}"' if family else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}"{a}{w}{l}{f}>{s}</text>'


def line(x1, y1, x2, y2, color=MUTED, w=1, dash=None, marker=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    me = f' marker-end="url(#{marker})"' if marker else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="{w}" fill="none"{da}{me}/>'


# --------------------------------------------------------------- 01 timeline
def event():
    H = 276
    s = [head(W, H, "33 年，断在 11 月 12 日夜里", "从 1993 年创业到 2026 年辞职，中间是三十三年。")]
    ay = 126
    x0, x1 = 118, 834
    s.append(line(x0, ay, x1, ay, INK, 1))
    # 1993
    s.append(f'<circle cx="{x0}" cy="{ay}" r="5" fill="{PAPER}" stroke="{MUTED}" stroke-width="1.2"/>')
    s.append(txt(x0 - 4, ay - 62, "1993", 14, INK, weight=600, family="EB Garamond,serif"))
    s.append(txt(x0 - 4, ay - 42, "与两名伙伴创业", 10.5, MUTED))
    s.append(txt(x0 - 4, ay + 26, "启动资金不多，第一条芯片路线就走错", 10.5, SOFT))
    # 33 年
    s.append(txt((x0 + x1) / 2, ay - 30, "33 年", 32, INK, anchor="middle", family="EB Garamond,serif"))
    s.append(txt((x0 + x1) / 2, ay + 26, "同一个人，同一家公司", 10.5, SOFT, anchor="middle"))
    # 2026.11.12
    s.append(f'<circle cx="{x1}" cy="{ay}" r="7" fill="{ACCENT_TINT}" stroke="{ACCENT}" stroke-width="1.4"/>')
    s.append(txt(x1 + 4, ay - 62, "2026.11.12", 14, ACCENT, anchor="end", weight=600, family="EB Garamond,serif"))
    s.append(txt(x1 + 4, ay - 42, "辞去总裁、CEO、董事全部职务", 10.5, INK, anchor="end"))
    # 股价的跳水：只在断点右侧画一小段
    s.append(line(x1, ay + 10, x1, ay + 38, ACCENT, 1, dash="4,4"))
    s.append(txt(x1 - 6, ay + 34, "股价盘中跳水", 10.5, ACCENT, anchor="end"))
    # 接棒的人
    bw, bh = 226, 48
    bx, by = x1 - bw, ay + 58
    s.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="{PAPER}" stroke="{MUTED}" stroke-width="1"/>')
    s.append(txt(bx + bw / 2, by + 20, "CFO 科莱特·克雷斯", 12.5, INK, anchor="middle", weight=600))
    s.append(txt(bx + bw / 2, by + 37, "临时接棒", 10.5, MUTED, anchor="middle"))
    s.append(txt(x0, by + 66, "公告在夜里发出；第二天市场才开始反应。", 11.5, SOFT))
    s.append('</svg>')
    page("01-event.html",
         "图 01 · 断点", "一纸公告",
         "33 年，在 11 月 12 日夜里断掉",
         "英伟达公告：黄仁勋辞去总裁、CEO、董事全部职务，CFO 科莱特·克雷斯临时接棒，股价盘中跳水。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>断点（终止任期）</span>'
         f'<span><i style="background:{PAPER};border:1px solid {MUTED}"></i>接任者</span>'
         f'<span>轴线只标两个真实日期，中间不加刻度</span>',
         "日期与职务变动来自原文；股价反应原文只说「盘中快速跳水」，无具体幅度",
         "952 宽　时间轴　两点", "33 年的任期，结束在一个工作日的夜里。")

# ------------------------------------------------ 02 delta（现金 vs 账面）
def cash():
    H = 356
    s = [head(W, H, "银行卡里的现金，与账面上的千亿", "左边是能花的钱，右边是被股价算出来的钱。")]
    x_lab, x_bar = 78, 300
    # 现金
    y1 = 34
    s.append(txt(x_lab, y1 + 22, "银行卡里的现金", 12.5, MUTED))
    s.append(f'<rect x="{x_bar}" y="{y1}" width="30" height="34" fill="{PAPER}" stroke="{RULE_SOLID}" stroke-width="1"/>')
    s.append(txt(x_bar + 44, y1 + 22, "不是资产的主体", 11, SOFT))
    # 账面
    y2 = 140
    s.append(txt(x_lab, y2 + 26, "按实时股价算的身家", 12.5, INK, weight=600))
    s.append(f'<rect x="{x_bar}" y="{y2}" width="566" height="52" fill="{ACCENT_TINT}" stroke="{ACCENT}" stroke-width="1.2"/>')
    s.append(txt(x_bar + 18, y2 + 33, "上千亿", 17, ACCENT, weight=600))
    s.append(txt(x_bar + 82, y2 + 32, "股价一动，这个数字就跟着动", 11, MUTED))
    s.append(txt(x_bar, y2 + 84, "与现金的差额就是股价波动；它不是一笔能取出来的钱。", 11, SOFT))
    # 信托这把锁
    ly = 252
    s.append(f'<rect x="{x_bar}" y="{ly}" width="566" height="68" fill="rgba(45,49,66,0.03)" stroke="{RULE}" stroke-width="1"/>')
    s.append(txt(x_bar + 18, ly + 26, "绝大部分股票在家族信托里", 12, INK, weight=600))
    s.append(txt(x_bar + 18, ly + 46, "有明确的交易限制：不能随心所欲卖出", 11, MUTED))
    lx = x_bar + 500
    s.append(f'<rect x="{lx}" y="{ly + 20}" width="34" height="26" fill="{PAPER}" stroke="{INK}" stroke-width="1.4"/>')
    s.append(f'<path d="M{lx + 9} {ly + 20} V{ly + 12} A8 8 0 0 1 {lx + 25} {ly + 12} V{ly + 20}" stroke="{INK}" stroke-width="1.4" fill="none"/>')
    s.append(txt(x_lab, ly + 44, "账面有，能动用的少。", 11.5, SOFT))
    s.append('</svg>')
    page("02-cash.html",
         "图 02 · 账面", "千亿不是现金",
         "千亿是算出来的，不是躺着的",
         "千亿身家不是银行卡里的现金：绝大部分股票进了家族信托，有交易限制，账面数字随实时股价起伏。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>账面身家（随股价）</span>'
         f'<span><i style="background:{PAPER};border:1px solid {RULE_SOLID}"></i>现金（不是主体）</span>'
         f'<span>条长为量级示意，不是精确金额</span>',
         "现金与账面两条长度为量级示意；原文只说「不是现金」「绝大部分在信托」，未给具体金额",
         "952 宽　对比　两栏", "看起来是千亿，动起来要看信托条款。")

# ------------------------------------------------- 03 unit-grid（信托三件事）
def trust():
    H = 232
    s = [head(W, H, "一套信托，同时办三件事", "锁股权、隔资产、保稳定，是一件安排的三面。")]
    cells = [
        ("01", "锁住股权", "股票进信托，不能随心所欲卖出", "卖不掉，就别指望随时套现", False),
        ("02", "资产隔离", "规避高额遗产税", "把税和遗产的账提前算清", True),
        ("03", "持股稳定", "不会因个人变动被快速抛售", "股价不因一个人的去留抖一下", False),
    ]
    cw, gap, y, ch = 288, 24, 30, 156
    x0 = (W - (cw * 3 + gap * 2)) / 2
    for i, (num, name, sub, sub2, focal) in enumerate(cells):
        x = x0 + i * (cw + gap)
        fill = ACCENT_TINT if focal else PAPER
        stroke = ACCENT if focal else RULE_SOLID
        s.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
        s.append(txt(x + 20, y + 34, num, 11, ACCENT if focal else SOFT, family="EB Garamond,serif"))
        s.append(txt(x + 20, y + 66, name, 17, ACCENT if focal else INK, weight=600))
        s.append(f'<line x1="{x + 20}" y1="{y + 84}" x2="{x + cw - 20}" y2="{y + 84}" stroke="{RULE}" stroke-width="1"/>')
        s.append(txt(x + 20, y + 108, sub, 11, MUTED))
        s.append(txt(x + 20, y + 132, sub2, 10.5, SOFT))
    s.append(txt(x0, y + ch + 38, "这三件事不是三次操作，是同一份信托安排同时达成的结果。", 11.5, SOFT))
    s.append('</svg>')
    page("03-trust.html",
         "图 03 · 信托", "一份安排，三个目的",
         "锁住、隔开、稳住",
         "信托不只是锁股权：它还做资产隔离、规避高额遗产税，并保证股权不会因个人变动被快速抛售。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>焦点：资产隔离</span>'
         f'<span><i style="background:{PAPER};border:1px solid {RULE_SOLID}"></i>另外两个目的</span>'
         f'<span>三格等宽，表示同时成立，不分先后</span>',
         "三个目的为原文直述；「同时成立」的并列关系是作者整理",
         "952 宽　三格　并列", "锁住股权，就是锁住「随时能卖」这件事。")

# --------------------------------------------- 04 waterfall（现金流三十天）
def crash():
    H = 392
    s = [head(W, H, "从「资金不多」到「只剩三十天」", "五级水位，中间那根是全文唯一的硬数字。")]
    base, top = 330, 96
    bars = [
        ("起步", "资金不多", 0.82),
        ("路线出错", "钱往下烧", 0.56),
        ("见底", "只够三十天", 0.12),
        ("世嘉注款", "项目款转支持", 0.60),
        ("喘过来", "得以继续", 0.72),
    ]
    bw, pitch = 104, 152
    x0 = (W - (bw + pitch * 4)) / 2
    for i, (name, sub, ratio) in enumerate(bars):
        x = x0 + i * pitch
        h = (base - top) * ratio
        focal = i == 2
        fill = ACCENT_TINT if focal else "rgba(45,49,66,0.055)"
        stroke = ACCENT if focal else MUTED
        s.append(f'<rect x="{x}" y="{base - h}" width="{bw}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>')
        if i:
            ph = (base - top) * bars[i - 1][2]
            s.append(line(x - pitch + bw, base - ph, x, base - ph, "rgba(45,49,66,0.55)", 1))
        s.append(txt(x + bw / 2, base + 26, name, 11.5, ACCENT if focal else INK, anchor="middle", weight=600))
        s.append(txt(x + bw / 2, base + 44, sub, 10, SOFT, anchor="middle"))
        if focal:
            s.append(txt(x + bw / 2, base - h - 12, "三十天", 15, ACCENT, anchor="middle", family="EB Garamond,serif"))
    s.append(line(x0, base, x0 + bw + pitch * 4, base, INK, 1))
    s.append(txt(x0, 34, "现金水位（定性）", 10.5, SOFT, ls="0.12em"))
    s.append(txt(x0, 54, "水位是叙述顺序的示意，不对应金额；只有「三十天」「裁掉七成」是原文数字。", 10.5, MUTED))
    s.append('</svg>')
    page("04-crash.html",
         "图 04 · 现金流", "只够三十天",
         "账上只剩三十天的时候",
         "1993 年创业，第一条芯片路线出错，资金链见底，裁掉七成员工；世嘉把这笔项目款转成支持，公司才喘过来。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>最低点（原文数字）</span>'
         f'<span><i style="background:rgba(45,49,66,0.055);border:1px solid {MUTED}"></i>其余水位</span>'
         f'<span>水位为定性示意，未按金额刻度</span>',
         "除「三十天」「七成」外，其余水位为叙述顺序示意；原文未给金额",
         "952 宽　水位　五级", "离破产三十天，离千亿三十年。")

# ------------------------------------------------ 05 timeline（长平后抬头）
def cuda():
    H = 300
    s = [head(W, H, "投进去十几年，才等到 AI 来敲门", "一条长平线，拐点之前没有回报。")]
    x0, x1, xk = 104, 856, 620
    yflat, ytop = 238, 88
    s.append(line(x0, yflat, xk, yflat, MUTED, 1.4))
    s.append(line(xk, yflat, xk, ytop, MUTED, 1, dash="4,4"))
    s.append(line(xk, ytop, x1, ytop, ACCENT, 1.6))
    s.append(f'<circle cx="{xk}" cy="{ytop}" r="4" fill="{ACCENT}"/>')
    s.append(txt(x0, yflat - 16, "十几年：持续投入，没有可观收益", 12, INK))
    s.append(txt(x0, yflat + 30, "质疑来自内部，也来自资本市场", 10.5, SOFT))
    s.append(txt(xk + 22, ytop + 22, "CUDA 成了碾压同行的护城河", 11.5, MUTED))
    s.append(txt(xk + 22, ytop - 14, "AI 浪潮之后", 12.5, ACCENT, weight=600))
    s.append(line(xk, 258, xk, 274, SOFT, 1))
    s.append(txt(xk, 290, "拐点", 10.5, SOFT, anchor="middle"))
    s.append(txt(x0, 34, "回报", 10.5, SOFT, ls="0.12em"))
    s.append(txt(x0, 50, "（定性）", 9.5, SOFT))
    s.append('</svg>')
    page("05-cuda.html",
         "图 05 · 长坡", "十几年不下牌桌",
         "拐点之前，它一直是成本",
         "CUDA 投了十几年、长期没有可观收益，直到 AI 浪潮到来才成为英伟达碾压同行的护城河。",
         "".join(s),
         f'<span><i style="background:{ACCENT}"></i>拐点之后</span>'
         f'<span><i style="background:{MUTED}"></i>沉默期</span>'
         f'<span>纵轴为定性，只表达「低—高」，不是收益曲线</span>',
         "「十几年」为原文模糊量；纵轴定性，非连续收益刻度",
         "952 宽　长坡　两段", "敢在看不见回报的地方下注，才等得到拐点。")

# -------------------------------------------------- 06 bar（生活配置）
def life():
    H = 372
    s = [head(W, H, "三样配置，量级差得很远", "飞机是上亿，豪宅是数千万，豪车没有金额。")]
    rows = [
        ("私人飞机", "庞巴迪环球 7500", 460, "上亿美元", True),
        ("旧金山豪宅", "公开报道里提到", 228, "数千万美元", False),
        ("豪车收藏", "外媒早有记录", 0, "无金额", False),
    ]
    x_lab, x_bar, bw_max, bh, pitch = 70, 286, 460, 34, 92
    for i, (name, sub, bw, val, focal) in enumerate(rows):
        y = 30 + i * pitch
        s.append(txt(x_lab, y + 18, name, 13, ACCENT if focal else INK, weight=600))
        s.append(txt(x_lab, y + 36, sub, 10, SOFT))
        if bw:
            fill = ACCENT_TINT if focal else "rgba(45,49,66,0.055)"
            s.append(f'<rect x="{x_bar}" y="{y}" width="{bw}" height="{bh}" fill="{fill}" stroke="{ACCENT if focal else MUTED}" stroke-width="1"/>')
        else:
            s.append(f'<rect x="{x_bar}" y="{y}" width="{bw_max}" height="{bh}" fill="none" stroke="{RULE_SOLID}" stroke-width="1" stroke-dasharray="4,4"/>')
        s.append(txt(786, y + 24, val, 13, ACCENT if focal else INK))
    s.append(txt(x_lab, 30 + 3 * pitch + 26, "条长按量级示意：上亿 > 数千万；豪车没有金额，画成空条。", 11, MUTED))
    s.append(txt(x_lab, 30 + 3 * pitch + 46, "「配套」两个字值得留意：这些是商业成功的支出，不是财富的来源。", 11.5, SOFT))
    s.append('</svg>')
    page("06-life.html",
         "图 06 · 配置", "顶配的那一面",
         "上亿的飞机，数千万的房",
         "他持有庞巴迪环球 7500 私人飞机，价值上亿美元；旧金山有数千万美元的豪宅，豪车收藏有外媒记录。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>量级最大</span>'
         f'<span><i style="background:rgba(45,49,66,0.055);border:1px solid {MUTED}"></i>其余配置</span>'
         f'<span>虚线空条＝原文未给金额</span>',
         "金额均为原文口径（上亿美元、数千万美元），未换算精确数字",
         "952 宽　条形　三项", "这些是结果，不是来源。")

# ------------------------------------------------ 07 dumbbell（八元对一亿）
def contrast():
    H = 268
    s = [head(W, H, "八元一杯，和上亿美元的飞机", "同一个人，同一天的两笔支出。")]
    y = 150
    xa, xb = 148, 828
    s.append(line(xa, y, xb, y, MUTED, 1.2))
    s.append(f'<circle cx="{xa}" cy="{y}" r="5" fill="{PAPER}" stroke="{ACCENT}" stroke-width="1.6"/>')
    s.append(f'<circle cx="{xb}" cy="{y}" r="5" fill="{PAPER}" stroke="{MUTED}" stroke-width="1.6"/>')
    s.append(txt(xa, y - 48, "一杯平价饮品", 10.5, MUTED))
    s.append(txt(xa, y - 16, "八元", 26, ACCENT, family="EB Garamond,serif"))
    s.append(txt(xb, y - 48, "一架私人飞机", 10.5, MUTED, anchor="end"))
    s.append(txt(xb, y - 16, "上亿美元", 26, INK, anchor="end", family="EB Garamond,serif"))
    s.append(txt((xa + xb) / 2, y + 30, "八元 ≈ 10⁰ 元级　上亿 ≈ 10⁸ 元级", 10.5, SOFT, anchor="middle"))
    s.append(line(xa + 20, y + 52, xb - 20, y + 52, SOFT, 1))
    s.append(txt((xa + xb) / 2, y + 76, "跨了八个数量级", 13, INK, anchor="middle", weight=600))
    s.append(txt((xa + xb) / 2, y + 100, "南锣鼓巷的那碗炸酱面：三十多块。", 11, MUTED, anchor="middle"))
    s.append('</svg>')
    page("07-contrast.html",
         "图 07 · 反差", "同一双手",
         "八元，对上亿",
         "他买过八元一杯的平价饮品、吃过三十多块一碗的炸酱面，也持有价值上亿美元的私人飞机。",
         "".join(s),
         f'<span><i style="background:{PAPER};border:1px solid {ACCENT}"></i>街头那笔（焦点）</span>'
         f'<span><i style="background:{PAPER};border:1px solid {MUTED}"></i>顶配那笔</span>'
         f'<span>数量级为换算，非原文措辞；原文只说「八元」「上亿美元」</span>',
         "「跨了八个数量级」是作者按 8 元与 1 亿美元量级换算，原文未作此比较",
         "952 宽　哑铃　两端", "能买下一条街的人，在街边排队买饮品。")

# ---------------------------------------------------- 08 venn（公益与税）
def charity():
    H = 352
    s = [head(W, H, "捐股票这件事，两个圈真的叠在一起", "公益目标与税务安排，在同一个动作上重合。")]
    cy, r = 176, 132
    cx1, cx2 = 404, 548
    s.append(f'<circle cx="{cx1}" cy="{cy}" r="{r}" fill="rgba(45,49,66,0.03)" stroke="{MUTED}" stroke-width="1"/>')
    s.append(f'<circle cx="{cx2}" cy="{cy}" r="{r}" fill="rgba(45,49,66,0.04)" stroke="{MUTED}" stroke-width="1"/>')
    s.append(txt(cx1 - 74, cy - 4, "公益", 19, INK, anchor="middle", weight=600))
    s.append(txt(cx1 - 74, cy + 16, "教育、科研", 10, MUTED, anchor="middle"))
    s.append(txt(cx2 + 74, cy - 4, "税负", 19, INK, anchor="middle", weight=600))
    s.append(txt(cx2 + 74, cy + 16, "抵扣税负", 10, MUTED, anchor="middle"))
    # 交集：落在透镜正中的小框
    bw, bh = 92, 52
    bx, by = (cx1 + cx2) / 2 - bw / 2, cy + 30
    s.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="{PAPER}" stroke="{ACCENT}" stroke-width="1.2"/>')
    s.append(txt(bx + bw / 2, by + 22, "捐自家股票", 12, ACCENT, anchor="middle", weight=600))
    s.append(txt(bx + bw / 2, by + 40, "一件事，两头成立", 9, MUTED, anchor="middle"))
    s.append(txt(64, 306, "基金会主要捐赠标的，就是英伟达股票", 10.5, SOFT))
    s.append(txt(W - 64, 306, "不能只读成减税工具", 10.5, SOFT, anchor="end"))
    s.append('</svg>')
    page("08-charity.html",
         "图 08 · 慈善", "两个圈，一处交集",
         "公益与税负，在同一只股票上重合",
         "夫妇基金会主要捐的就是自家英伟达股票：一头投教育科研兑现社会责任，一头在美国税法下抵扣税负。",
         "".join(s),
         f'<span><i style="background:{PAPER};border:1px solid {ACCENT}"></i>交集（一件事两头成立）</span>'
         f'<span><i style="background:rgba(45,49,66,0.035);border:1px solid {MUTED}"></i>两个目的各自成立</span>'
         f'<span>两圈等大：不表示公益比税务更重要</span>',
         "「并行不悖」为原文判断；交集画法是作者整理",
         "952 宽　交集　两圈", "公益与税务，本来就不是二选一。")

# -------------------------------------------------- 09 nested（还绑着什么）
def bind():
    H = 300
    s = [head(W, H, "卸任之后，还绑着的是什么", "职务卸了，股权与生态还在公司身上。")]
    ox, oy, ow, oh = 62, 40, W - 124, 210
    s.append(f'<rect x="{ox}" y="{oy}" width="{ow}" height="{oh}" fill="none" stroke="{INK}" stroke-width="1"/>')
    s.append(txt(ox + 18, oy - 14, "英伟达", 13, INK, weight=600))
    s.append(txt(ox + ow - 18, oy - 14, "他已卸任：总裁 / CEO / 董事", 10.5, MUTED, anchor="end"))
    iy, ih = oy + 40, 130
    iw1 = 372
    x1 = ox + 28
    x2 = x1 + iw1 + 28
    iw2 = ox + ow - 28 - x2
    s.append(f'<rect x="{x1}" y="{iy}" width="{iw1}" height="{ih}" fill="rgba(45,49,66,0.045)" stroke="{MUTED}" stroke-width="1"/>')
    s.append(txt(x1 + 18, iy + 30, "信托里的大量股权", 14, INK, weight=600))
    s.append(txt(x1 + 18, iy + 52, "与英伟达深度绑定", 11, MUTED))
    s.append(txt(x1 + 18, iy + 84, "他卸的是职务", 10.5, SOFT))
    s.append(txt(x1 + 18, iy + 102, "不是这份持股", 10.5, SOFT))
    s.append(f'<rect x="{x2}" y="{iy}" width="{iw2}" height="{ih}" fill="{ACCENT_TINT}" stroke="{ACCENT}" stroke-width="1.2"/>')
    s.append(txt(x2 + 18, iy + 30, "CUDA 生态", 14, ACCENT, weight=600))
    s.append(txt(x2 + 18, iy + 52, "渠道 / 技术路线", 11, INK))
    s.append(txt(x2 + 18, iy + 84, "已经刻进骨架", 10.5, MUTED))
    s.append(txt(x2 + 18, iy + 102, "短期难替代", 10.5, MUTED))
    s.append(txt(ox, oy + oh + 30, "股权与生态都在公司身上；职务是对外的接口，卸掉接口不等于卸掉股份。", 11.5, SOFT))
    s.append('</svg>')
    page("09-bind.html",
         "图 09 · 绑定", "卸任不等于退出",
         "卸的是职务，不是股份",
         "他卸下 CEO 与董事职务，但信托里的大量股权仍与英伟达深度绑定；CUDA 生态、渠道、技术路线也仍在他搭的骨架里。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>他亲手搭的生态</span>'
         f'<span><i style="background:rgba(45,49,66,0.045);border:1px solid {MUTED}"></i>仍绑定的股权</span>'
         f'<span>外层框＝公司；两块并列，不表示谁包含谁</span>',
         "「刻进骨架、短期难替代」为原文判断；嵌套画法为作者整理",
         "952 宽　嵌套　两层", "交接的是日程，不是资产。")

# ----------------------------------------------------- 10 kanban（三条真相）
def truth():
    H = 292
    s = [head(W, H, "收成三条", "一篇讲财富的文章，最后落在三句话上。")]
    cols = [
        ("01", "财富是枷锁", "账面吓人，处处是规则", "卖不掉、动不了；数字只说明市值", False),
        ("02", "长期下注才抓风口", "敢在看不清回报的方向待着", "十几年不下牌桌，才等到 AI", False),
        ("03", "顶配与朴素并存", "飞机上亿，饮品八元", "反差不是表演，是习惯", True),
    ]
    cw, gap, y, ch = 284, 26, 26, 198
    x0 = (W - (cw * 3 + gap * 2)) / 2
    for i, (num, name, sub, sub2, focal) in enumerate(cols):
        x = x0 + i * (cw + gap)
        s.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" fill="{ACCENT_TINT if focal else PAPER}" stroke="{ACCENT if focal else RULE_SOLID}" stroke-width="1"/>')
        s.append(txt(x + 18, y + 30, num, 11, ACCENT if focal else SOFT, family="EB Garamond,serif"))
        s.append(txt(x + 18, y + 78, name, 15, ACCENT if focal else INK, weight=600))
        s.append(f'<line x1="{x + 18}" y1="{y + 98}" x2="{x + cw - 18}" y2="{y + 98}" stroke="{RULE}" stroke-width="1"/>')
        s.append(txt(x + 18, y + 126, sub, 10.5, MUTED))
        s.append(txt(x + 18, y + 152, sub2, 10.5, SOFT))
    s.append(txt(x0, y + ch + 34, "三条不是依次发生的，是同一个人身上的三面。", 11, MUTED))
    s.append('</svg>')
    page("10-truth.html",
         "图 10 · 三条", "财富的三面",
         "枷锁、下注、生活",
         "他把顶级富豪的财富游戏收成三条：账面财富是规则枷锁，长期下注才抓风口，顶配与朴素可以并存。",
         "".join(s),
         f'<span><i style="background:{ACCENT_TINT};border:1px solid {ACCENT}"></i>焦点：生活那一面</span>'
         f'<span><i style="background:{PAPER};border:1px solid {RULE_SOLID}"></i>结构与选择两面</span>'
         f'<span>三列并列，无先后</span>',
         "三条为原文结尾的原话归纳，措辞有压缩",
         "952 宽　三列　并列", "看懂取舍与风险，比羡慕数字有用。")


if __name__ == "__main__":
    event()
    cash()
    trust()
    crash()
    cuda()
    life()
    contrast()
    charity()
    bind()
    truth()
    print("all done")
