"""16:9 视频构图库：十二套版面，含"图文互相咬合"的做法。

不是把同一张页换几个位置，而是换**图文关系**：文字压页、文字被页遮、页面开窗放大、
竖线分栏、双页并置、巨号编号垫底、字出血……每套一个手法。

    python compose_layouts.py <页面目录> <输出目录> <headlines.json> [--only A,B]

版式编号（A~L），另加竖排族变体；`--only` 可只渲某几套做样张。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (245, 245, 245)
INK = (45, 49, 66)
MUTED = (79, 93, 117)
SOFT = (110, 118, 134)
RULE = (191, 192, 192)
ACCENT = (191, 69, 32)
W, H = 1920, 1080
PAD = 84
PAGE_W = 1184
PAGE_H = 960
BIG = 46
COL_W = 440


def find_font():
    """屏幕大字用哪套字，不写死在脚本里。

    顺序：`ARTICLE_VIDEO_FONT`（直接给 .otf/.ttf 文件）→ `FIGKIT_FONTS`（字体根目录，
    与 article-figures 共用一个环境变量）→ 本机默认位置 → 报错。
    汇文明朝体在 npm 包里是 `fontpkg-huiwen-mincho-*/package/Huiwen-mincho.otf`，
    直接拼 `fonts-src/Huiwen-mincho.otf` 会 FileNotFound——已经踩过两次。
    """
    import os

    env_file = os.environ.get("ARTICLE_VIDEO_FONT")
    if env_file and Path(env_file).exists():
        return env_file
    roots = [os.environ.get("FIGKIT_FONTS"),
             str(Path.home() / ".cache" / "design-kit" / "fonts-src"),
             r"E:\works\New Journal\个人商业实战\.cache\design-kit\fonts-src"]
    names = ("fontpkg-huiwen-mincho-1.0.0/package/Huiwen-mincho.otf",
             "Huiwen-mincho.otf", "fonts/Huiwen-mincho.otf")
    for root in roots:
        if not root:
            continue
        for n in names:
            p = Path(root) / n
            if p.exists():
                return str(p)
        hits = sorted(Path(root).glob("**/Huiwen*.otf"))
        if hits:
            return str(hits[0])
    raise SystemExit(
        "找不到汇文明朝体：设 ARTICLE_VIDEO_FONT 指到 .otf 文件，或设 FIGKIT_FONTS 指到字体根目录"
        "（article-figures 的 fetch_fonts.ps1 拉下来的那个）"
    )


FONT = find_font()

LAYOUTS = {}


def reg(*names):
    def deco(fn):
        for n in names:
            LAYOUTS[n] = fn
        return fn
    return deco


# ---------------------------------------------------------------- primitives
def tw(d, s, f):
    return d.textlength(s, font=f)


def wrap(d, text, font, max_w):
    lines, cur = [], ""
    for ch in text:
        if tw(d, cur + ch, font) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def page_at(im, k, anchor):
    """按系数 k 缩放页面；anchor = (x, y) 或 ('left'|'right'|'center', y)。"""
    w, h = round(im.width * k), round(im.height * k)
    s = im.resize((w, h), Image.LANCZOS)
    ax, ay = anchor
    if ax == 'left':
        x = PAD
    elif ax == 'right':
        x = W - PAD - w
    elif ax == 'center':
        x = (W - w) // 2
    else:
        x = ax
    y = (H - h) // 2 if ay is None else (ay if isinstance(ay, int) else (H - h) // 2)
    return s, x, y


def htext(d, text, x, font, col_w, y_top=None, align='left', color=INK, mask=False):
    lines = wrap(d, text, font, col_w)
    lh = int(font.size * 1.6)
    y = (H - len(lines) * lh) // 2 - 16 if y_top is None else y_top
    if mask:
        pad = int(font.size * 0.7)
        d.rectangle([x - pad, y - pad, x + col_w + pad, y + len(lines) * lh + pad], fill=PAPER)
    for ln in lines:
        xx = x + col_w - tw(d, ln, font) if align == 'right' else x
        d.text((xx, y), ln, font=font, fill=color)
        y += lh
    return y


def vtext(d, text, x_right, font, cols=1, gap=None, color=INK, y_top=None):
    step = int(font.size * 1.16)
    per = max(1, (H - 240) // step)
    chunks = [text[i:i + per] for i in range(0, len(text), per)] or [text]
    chunks = chunks[:cols]
    gap = gap or int(font.size * 1.7)
    x = x_right
    for ch_chunk in chunks:
        y = (H - len(ch_chunk) * step) // 2 - 8 if y_top is None else y_top
        for ch in ch_chunk:
            d.text((x, y), ch, font=font, fill=color)
            y += step
        x -= gap
    return x


def idx(d, i, total, x, y, font, align='left', color=SOFT):
    t = f"{i + 1:02d} / {total:02d}"
    if align == 'right':
        d.text((x - tw(d, t, font), y), t, font=font, fill=color)
    else:
        d.text((x, y), t, font=font, fill=color)


def rule(d, p0, p1):
    d.line([p0, p1], fill=RULE, width=1)


# ---------------------------------------------------------------- layouts
@reg('A')
def A_H_right(c, im, text, i, n, f, s):
    s_, x, y = page_at(im, 1, ('left', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    end = htext(d, text, PAD + PAGE_W + 72, f, COL_W)
    idx(d, i, n, PAD + PAGE_W + 72, end + 24, s)


@reg('B')
def B_H_left(c, im, text, i, n, f, s):
    s_, x, y = page_at(im, 1, ('right', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    end = htext(d, text, PAD, f, COL_W)
    idx(d, i, n, PAD, end + 24, s)


@reg('C')
def C_V_right(c, im, text, i, n, f, s):
    s_, x, y = page_at(im, 1, ('left', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    size = BIG if len(text) <= 14 else 40 if len(text) <= 18 else 36
    vtext(d, text, W - PAD - size, ImageFont.truetype(FONT, size), 1)
    idx(d, i, n, PAD + PAGE_W + 72, H - 104, s)


@reg('D')
def D_V_left(c, im, text, i, n, f, s):
    s_, x, y = page_at(im, 1, ('right', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    size = BIG if len(text) <= 14 else 40 if len(text) <= 18 else 36
    vtext(d, text, PAD + COL_W - 40, ImageFont.truetype(FONT, size), 1)
    idx(d, i, n, PAD, H - 104, s)


@reg('E')
def E_V_duo(c, im, text, i, n, f, s):
    s_, x, y = page_at(im, 1, ('left', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    vtext(d, text, W - PAD - BIG, f, 2, gap=112)
    idx(d, i, n, PAD + PAGE_W + 72, H - 104, s)


@reg('F')
def F_V_note(c, im, text, i, n, f, s):
    """批注：字紧贴页右边缘，中间一条竖线分开。"""
    s_, x, y = page_at(im, 1, ('left', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    x_edge = PAD + PAGE_W
    rule(d, (x_edge + 26, 150), (x_edge + 26, H - 150))
    tiny = ImageFont.truetype(FONT, 34)
    vtext(d, text, x_edge + 96, tiny, 2, gap=54, color=MUTED)
    idx(d, i, n, x_edge + 96, H - 96, s, align='right')


@reg('G')
def G_cut(c, im, text, i, n, f, s):
    """字块切页：纸色底衬只压页面右侧留白（60px），不盖正文。"""
    s_, x, y = page_at(im, 1, ('left', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    bx = PAD + PAGE_W - 58
    end = htext(d, text, bx, f, 520, mask=True)
    idx(d, i, n, bx, end + 24, s)


@reg('H')
def H_zoom(c, im, text, i, n, f, s):
    """开窗放大：小页在左上，右下把页面的一块局部放大成"细节窗"。"""
    s_, x, y = page_at(im, 0.66, (PAD, 46)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    win_x, win_y, win_w = 1060, 430, 760
    crop = im.crop((int(im.width * .40), int(im.height * .48), int(im.width * .92), int(im.height * .96)))
    ch = round(crop.height * win_w / crop.width)
    crop = crop.resize((win_w, ch), Image.LANCZOS)
    c.paste(crop, (win_x, win_y))
    d.rectangle([win_x, win_y, win_x + win_w, win_y + ch], outline=RULE, width=1)
    tag = ImageFont.truetype(FONT, 22)
    d.text((win_x + 12, win_y - 34), "局部放大", font=tag, fill=SOFT)
    htext(d, text, win_x, f, win_w, y_top=150)
    idx(d, i, n, win_x, 96, s)


@reg('I')
def I_bleed(c, im, text, i, n, f, s):
    """字出血：页在左上，大字贴右边缘出血压在下半幅，互不遮挡。"""
    s_, x, y = page_at(im, 0.66, (PAD, 52)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    big = ImageFont.truetype(FONT, 92)
    lines = wrap(d, text, big, W - 140)
    y0 = H - 96 - len(lines) * 128
    for ln in lines:
        d.text((W - 44 - tw(d, ln, big), y0), ln, font=big, fill=INK)
        y0 += 128
    idx(d, i, n, PAD, H - 92, s)


@reg('J')
def J_split(c, im, text, i, n, f, s):
    """竖线分栏：一条线切开画面，页在右、字在左竖排。"""
    s_, x, y = page_at(im, 0.74, ('right', None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    split_x = 96 + 420
    rule(d, (split_x, 90), (split_x, H - 90))
    tiny = ImageFont.truetype(FONT, 40)
    vtext(d, text, split_x - 42, tiny, 2, gap=62)
    idx(d, i, n, PAD, H - 96, s)


@reg('K')
def K_index(c, im, text, i, n, f, s):
    """巨号编号垫底：编号当背景元素，页居中偏右，字在右下角。

    编号位置按镜次奇偶换角：长片里 K 会用两次，钉死在左上会露馅。
    """
    s_, x, y = page_at(im, 0.8, (520, None)); c.paste(s_, (x, y))
    d = ImageDraw.Draw(c)
    num = ImageFont.truetype(FONT, 190)
    label = f"{i + 1:02d}"
    if i % 2 == 0:
        d.text((PAD + 20, 40), label, font=num, fill=(224, 222, 219))
    else:
        # 右下角：页压不住的位置，编号从画面右下"漏"出来
        wnum = tw(d, label, num)
        d.text((W - PAD - wnum, H - 260), label, font=num, fill=(224, 222, 219))
    htext(d, text, 520, f, s_.width, y_top=y + s_.height + 46)
    idx(d, i, n, W - PAD, H - 96, s, align='right')


@reg('L')
def L_edge(c, im, text, i, n, f, s):
    """出血压边：页面右半边出画，字在左侧竖排，像被裁掉一截的跨页。"""
    w_, h_ = round(im.width * 0.9), round(im.height * 0.9)
    s_ = im.resize((w_, h_), Image.LANCZOS)
    c.paste(s_, (W - w_ + 62, (H - h_) // 2))
    d = ImageDraw.Draw(c)
    rule(d, (PAD + 300, 120), (PAD + 300, H - 120))
    vtext(d, text, PAD + 268, ImageFont.truetype(FONT, 40), 2, gap=64)
    idx(d, i, n, PAD, H - 96, s)


# ---------------------------------------------------------------- 编排
PREFER = {
    'short': ['C', 'D', 'K', 'I', 'F'],
    'mid': ['A', 'B', 'G', 'H', 'J'],
    'long': ['E', 'G', 'J', 'A', 'B'],
}


def choose(text, used):
    band = 'short' if len(text) <= 12 else 'mid' if len(text) <= 18 else 'long'
    recent = used[-2:]
    for name in PREFER[band]:
        if name not in recent:
            return name
    for name in LAYOUTS:
        if name not in recent:
            return name
    return PREFER[band][0]


TEXT_RIGHT = {"A", "B", "C", "D", "E", "F", "G", "H", "J"}


# ---------------------------------------------------- 宽条族（图形区专用）
# 视频专用页只留图形区，形状是宽而矮（749×217 这种，比例 2.0–4.3）。A~L 是按 1080×800
# 整页排的，宽条塞进去只占 62%×32%，剩下全是纸色——这就是骨架图被一眼判空的原因。
#
# 定下的两条硬规矩（改之前先看这条）：
#   1. 图按**高度**铺（strip_fit），不按宽度铺。按宽铺到 1752 只有 507 高，半屏必空。
#   2. 图高锁在 0.38–0.62H：宽度 1856–2150，横裁 ≤10%。铺到 0.70H 以上会横裁 20–36%，
#      时间线两端的年份、瀑布图首尾的柱子都会没（v2 版踩过）。
# 半屏剩下的交给 96–124 号大字 + 结构线（细线 / 橙色短线 / 刻度 / 竖排编号 / 巨号垫底）。
STRIP_DEF = 54


def strip_font():
    return ImageFont.truetype(FONT, STRIP_DEF)


def _sf(sz):
    return ImageFont.truetype(FONT, sz)


def strip_fit(im, target_h, max_bleed=1.04):
    """宽条按高度铺；宽度最多出血到 1.04 倍画布，再宽就反过来按宽度定高。

    只按 target_h 铺会出事：03-trust 是 933×215（比例 4.34），铺到 0.52H 等于宽 2437，
    横裁 21%，三块里最右那块直接切掉。
    出血上限也不能放到 1.10：左右各裁 5% 已经会吃掉页内贴边的字，成片的运镜还要再放大
    4–6%，两层叠起来 01 帧的「1993」、12 帧的「可」字就是这么没的。1.04 只裁 2%（38px），
    小于页内 84px 的边距，运镜再推一档也切不到字。
    """
    k = target_h / im.height
    if im.width * k > W * max_bleed:
        k = W * max_bleed / im.width
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def _strip_paste(c, s_, y, align="center"):
    if align == "center":
        x = (W - s_.width) // 2
    elif align == "left":
        x = PAD
    else:
        x = -80
    c.paste(s_, (x, y))
    return x


@reg('S1')
def S1_top(c, im, text, i, n, f, s):
    """上图下文：图 0.52H 居中，细线压图底，104 号字在下。开场立页，最稳。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.52))
    _strip_paste(c, s_, 104)
    d.line([(PAD, 104 + s_.height + 26), (W - PAD, 104 + s_.height + 26)], fill=RULE, width=2)
    htext(d, text, PAD, _sf(104), W - 2 * PAD, y_top=104 + s_.height + 62)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S2')
def S2_bottom(c, im, text, i, n, f, s):
    """上文下图：104 号字先立在上，图 0.54H 兜底。给数、收束。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.54))
    htext(d, text, PAD, _sf(104), W - 2 * PAD, y_top=84)
    c.paste(s_, ((W - s_.width) // 2, H - 40 - s_.height))
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S3')
def S3_tag_left(c, im, text, i, n, f, s):
    """左题签：图 0.52H 居中，图下一条细线，镜号 90 号在左、112 号字在右。

    镜号不能竖排贴左边缘——图按高度铺满后宽 1856–2150，左边缘压的就是图形本身，
    第一版真帧里 06/16 两镜的编号全叠在图上。
    """
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.52))
    _strip_paste(c, s_, 96)
    ly = 96 + s_.height + 24
    d.line([(PAD, ly), (W - PAD, ly)], fill=RULE, width=2)
    d.text((PAD, ly + 22), f"{i + 1:02d} / {n:02d}", font=_sf(56), fill=(186, 184, 181))
    htext(d, text, PAD, _sf(112), W - 2 * PAD, y_top=ly + 96)


@reg('S4')
def S4_tag_right(c, im, text, i, n, f, s):
    """右题签：112 号字在上，镜号在右上，图 0.52H 压底。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.52))
    htext(d, text, PAD, _sf(112), W - 2 * PAD - 160, y_top=92)
    d.text((W - PAD - 146, 98), f"{i + 1:02d}", font=_sf(74), fill=(190, 188, 185))
    ly = H - 92 - s_.height - 24
    d.line([(PAD, ly), (W - PAD, ly)], fill=RULE, width=2)
    c.paste(s_, ((W - s_.width) // 2, H - 92 - s_.height))


@reg('S5')
def S5_bleed(c, im, text, i, n, f, s):
    """出血压顶：图 0.58H 上下出血（横裁约 10%），96 号字压在图下缘的纸色条上。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.58))
    _strip_paste(c, s_, -26)
    col_w = W - 2 * PAD - 120
    y0 = -26 + s_.height + 30
    lines = wrap(d, text, _sf(96), col_w)
    d.rectangle([PAD - 30, y0 - 26, PAD + col_w + 30, y0 + len(lines) * int(96 * 1.45) + 14], fill=PAPER)
    htext(d, text, PAD, _sf(96), col_w, y_top=y0)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S6')
def S6_jumbo(c, im, text, i, n, f, s):
    """缩图巨字：图缩到 0.38H 居中，118 号字压细线下。结论句。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.38))
    y = 132
    x = _strip_paste(c, s_, y)
    d.line([(x, y + s_.height + 30), (x + s_.width, y + s_.height + 30)], fill=RULE, width=2)
    htext(d, text, PAD, _sf(118), W - 2 * PAD, y_top=y + s_.height + 66)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S7')
def S7_duo(c, im, text, i, n, f, s):
    """双裁块并置：同一页左右两半并排，块宽按高度算（总高锁 0.58H），中间留竖线。

    块宽写死 900 会出事：06-life 是 800×343，切半后铺到 900 等于高 771，结论字直接被顶出画布。
    """
    d = ImageDraw.Draw(c)
    h_ = round(H * 0.58)
    left = im.crop((0, 0, im.width // 2, im.height))
    right = im.crop((im.width // 2, 0, im.width, im.height))
    l_ = strip_fit(left, h_)
    r_ = strip_fit(right, h_)
    gap = 60
    x0 = (W - (l_.width + gap + r_.width)) // 2
    y = 132
    c.paste(l_, (x0, y))
    c.paste(r_, (x0 + l_.width + gap, y))
    d.line([(x0 + l_.width + gap // 2, y - 22), (x0 + l_.width + gap // 2, y + h_ + 22)], fill=RULE, width=2)
    htext(d, text, PAD, _sf(96), W - 2 * PAD, y_top=y + h_ + 58)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S8')
def S8_bleed_line(c, im, text, i, n, f, s):
    """顶出血压线：图 0.62H 从顶出血，图下一条橙色短线，100 号字压在线下。转折镜。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.62))
    _strip_paste(c, s_, -34)
    ly = -34 + s_.height + 34
    d.line([(PAD, ly), (PAD + 420, ly)], fill=ACCENT, width=6)
    htext(d, text, PAD, _sf(100), W - 2 * PAD, y_top=ly + 34)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S9')
def S9_tilt(c, im, text, i, n, f, s):
    """斜置：图 0.50H 逆时针 2.2°，100 号字齐行压在图下。回忆/闪回。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.50))
    s_ = s_.rotate(2.2, expand=True, resample=Image.BICUBIC, fillcolor=PAPER)
    c.paste(s_, ((W - s_.width) // 2, 104))
    htext(d, text, PAD, _sf(100), W - 2 * PAD, y_top=104 + s_.height + 54, mask=True)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S10')
def S10_window(c, im, text, i, n, f, s):
    """局部开窗：图 0.54H 铺开，右下开一扇放大窗（橙框）指着细节。

    窄页（比例只有 1.99 的 04-crash）按高铺后只有 60% 宽，窗再压上去会把大字挤成两行，
    所以窄页把窗放到画布右侧、图缩到 0.72 宽靠左，字仍在图下方通栏。
    """
    d = ImageDraw.Draw(c)
    h_ = round(H * 0.54)
    s_ = strip_fit(im, h_)
    narrow = s_.width < W - 2 * PAD - 320
    if narrow:
        k = (W - 2 * PAD - 700) / im.width
        s_ = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        x, y = PAD, 120
    else:
        x, y = (W - s_.width) // 2, 112
    c.paste(s_, (x, y))
    win_w = 640 if not narrow else 620
    crop = im.crop((int(im.width * .52), int(im.height * .30), im.width, im.height))
    ch = round(crop.height * win_w / crop.width)
    win = crop.resize((win_w, ch), Image.LANCZOS)
    wx = (x + s_.width - win_w - 60) if not narrow else (W - PAD - win_w)
    wy = (y + s_.height - ch - 28) if not narrow else (y + round((s_.height - ch) / 2))
    c.paste(win, (wx, wy))
    d.rectangle([wx - 2, wy - 2, wx + win_w + 1, wy + ch + 1], outline=ACCENT, width=3)
    d.text((wx + 6, wy - 36), "放大", font=_sf(24), fill=ACCENT)
    htext(d, text, PAD, _sf(96), W - 2 * PAD, y_top=y + s_.height + 54)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S11')
def S11_scale(c, im, text, i, n, f, s):
    """刻度线：图 0.46H 在上，实线八道齿，112 号字贴线写。给数、有量纲的镜。"""
    d = ImageDraw.Draw(c)
    s_ = strip_fit(im, round(H * 0.46))
    y = 96
    _strip_paste(c, s_, y)
    line_y = y + s_.height + 92
    d.line([(PAD, line_y), (W - PAD, line_y)], fill=RULE, width=4)
    fw = W - 2 * PAD
    for k in range(9):
        d.line([(PAD + round(k * fw / 8), line_y - 12), (PAD + round(k * fw / 8), line_y + 12)], fill=RULE, width=2)
    htext(d, text, PAD, _sf(112), fw, y_top=line_y + 30)
    idx(d, i, n, W - PAD, H - 84, s, align='right')


@reg('S12')
def S12_index(c, im, text, i, n, f, s):
    """巨号垫底：编号 150 号压左上，图 0.50H 居中偏下，96 号字一行压右下。换气镜。"""
    d = ImageDraw.Draw(c)
    d.text((PAD - 8, 12), f"{i + 1:02d}", font=_sf(150), fill=(226, 224, 221))
    s_ = strip_fit(im, round(H * 0.50))
    _strip_paste(c, s_, 322)
    htext(d, text, PAD, _sf(96), W - 2 * PAD, y_top=322 + s_.height + 48)


def zoom_variant(canvas, layout="", k=1.26):
    """同一帧推近一档：裁掉一角、放大回原尺寸。

    **裁哪一角由版面决定，不能按画面重心裁**——按重心裁会把屏幕上的那句话切掉
    （实测 G 的右栏大字被裁成半句）。字在哪一侧，就保留那一侧，推的是页面。
    """
    w, h = canvas.size
    cw, ch = round(w / k), round(h / k)
    if layout in TEXT_RIGHT:
        x = w - cw            # 字在右：保留右侧
    elif layout:
        x = 0                 # 字在左（I / L）：保留左侧
    else:
        x = (w - cw) // 2
    y = h - ch if layout == "K" else (h - ch) // 2   # K 的字在页下方
    return canvas.crop((x, y, x + cw, y + ch)).resize((w, h), Image.LANCZOS)


def main(src, dst, head_path, only=None):
    src_dir, dst_dir = Path(src), Path(dst)
    dst_dir.mkdir(parents=True, exist_ok=True)
    pages = sorted(src_dir.glob("*.png"))
    data = json.loads(Path(head_path).read_text(encoding="utf-8"))
    heads = data.get("pages") or data.get("shots") if isinstance(data, dict) else data
    tallest = max(Image.open(p).height for p in pages)
    widest = max(Image.open(p).width for p in pages)
    # 页要同时塞进 PAGE_H 与 PAGE_W：只按高度算是老假设（页≈1080×800）。
    # 视频专用页是「图形区」，宽而矮（如 933×215），按高度缩会把画布撑爆。
    k = min(PAGE_H / tallest, PAGE_W / widest)
    f = ImageFont.truetype(FONT, BIG)
    s = ImageFont.truetype(FONT, 24)
    used = []
    for i, (p, hd) in enumerate(zip(pages, heads)):
        im = Image.open(p).convert("RGB")
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        canvas = Image.new("RGB", (W, H), PAPER)
        name = hd.get("layout") or choose(hd["headline"], used)
        if only and name not in only:
            name = choose(hd["headline"], used)
        # 素材形状决定版面族：没显式指定时才按形状自动选。
        # 显式给了 layout 就尊重——18 镜匹配表要靠 12 套宽条版式轮换，
        # 旧版这里无条件改成 S{1+i%4}，等于把表里所有 A~L 抹掉（2026-11-16 修）。
        if not hd.get("layout") and im.width / im.height > 1.8:
            name = f"S{1 + i % 4}"
        LAYOUTS[name](canvas, im, hd["headline"], i, len(pages), f, s)
        out = dst_dir / (p.stem + ".png")
        canvas.save(out)
        used.append(name)
        extra = ""
        if int(hd.get("frames") or 1) > 1:
            # 一页两镜：第二帧是同一构图的推近，不是另排一版
            zoom = zoom_variant(canvas, name)
            zout = dst_dir / (p.stem + "b.png")
            zoom.save(zout)
            extra = f" + {zout.name}（推近）"
        print(out.name, name, len(hd["headline"]), "字", extra)
    print("版式顺序:", " → ".join(used))
    # 把 shot plan 一起落进帧目录：下一步 build_script.py 靠它把版式映射成运镜
    (dst_dir / "shotplan.json").write_text(
        Path(head_path).read_text(encoding="utf-8"), encoding="utf-8")
    return 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    only = None
    if "--only" in argv:
        pos = argv.index("--only")
        only = set(argv[pos + 1].split(","))
        argv = argv[:pos] + argv[pos + 2:]
    if len(argv) != 3:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(argv[0], argv[1], argv[2], only))
