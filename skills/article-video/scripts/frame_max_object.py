# -*- coding: utf-8 -*-
"""一镜立不立得住：量单帧的「第一眼主体」。

    python frame_max_object.py <帧目录或单图> [--min 110] [--json out.json]

判据（都按 1080 尺度，来自 references/shot-design.md §3 与 composition.md §8）：
    主体高 < 80  → FAIL（这一镜没有主体）
    主体高 < 110 → WARN（主体太小，撑不住 45 帧以上）
    主体贴边（离画布边 < 96）→ FAIL
    字幕带 y ≥ 940 被占（非背景 > 0.5%）→ FAIL
    主体包围盒中心偏离 x=960 > 48px → WARN（组没居中）

做法：缩到 480×270 做四邻域连通，取最大非背景块，再按比例换算回 1920×1080。
只依赖 Pillow，不需要浏览器，也不需要渲染。
"""
import sys, os, json, glob
from collections import deque
from PIL import Image

W, H = 1920, 1080
SW, SH = 480, 270
EDGE, CAP_Y, EX, CENTER, TOL = 96, 940, 140, 960, 18   # TOL 要能认出 ALT 底卡(28) 与 pastel(38)，同时滤掉抗锯齿
SUFFIX = (".jpg", ".jpeg", ".png", ".webp")


def bg_of(im):
    px = im.load()
    vals = []
    for ox, oy in ((0, 0), (SW - 10, 0), (0, SH - 10), (SW - 10, SH - 10)):
        for x in range(ox, ox + 10, 3):
            for y in range(oy, oy + 10, 3):
                vals.append(px[x, y])
    vals.sort(key=lambda c: c[0] + c[1] + c[2])
    return vals[len(vals) // 2]


def largest_blob(im, bg):
    px = im.load()
    mask = [[False] * SH for _ in range(SW)]
    for x in range(SW):
        for y in range(SH):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > TOL:
                mask[x][y] = True
    for _ in range(3):                      # 3×3 膨胀三遍：把笔画聚成字、把字聚成行
        nm = [[False] * SH for _ in range(SW)]
        for x in range(SW):
            for y in range(SH):
                if mask[x][y]:
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < SW and 0 <= ny < SH:
                                nm[nx][ny] = True
        mask = nm
    seen = [[False] * SH for _ in range(SW)]
    best = (0, None)
    for x in range(SW):
        for y in range(SH):
            if not mask[x][y] or seen[x][y]:
                continue
            q, seen[x][y] = deque([(x, y)]), True
            seen[x][y] = True
            xs, ys, n = [], [], 0
            while q:
                cx, cy = q.popleft()
                n += 1
                xs.append(cx)
                ys.append(cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < SW and 0 <= ny < SH and mask[nx][ny] and not seen[nx][ny]:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
            if n > best[0]:
                best = (n, box)
    ax = [x for x in range(SW) if any(mask[x])]
    ay = [y for y in range(SH) if any(mask[x][y] for x in range(SW))]
    whole = (min(ax), min(ay), max(ax) + 1, max(ay) + 1) if ax else None
    return best, whole


def cap_ratio(im, bg):
    """字幕带里非背景像素占比"""
    px = im.load()
    y0 = int(CAP_Y * SH / H)
    tot = hit = 0
    for y in range(y0, SH):
        for x in range(SW):
            tot += 1
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > TOL:
                hit += 1
    return hit / max(1, tot)


def check_shape(path):
    """只收 16:9 单帧；总览拼图（多格拼在一起）会被量成一张奇怪的大图"""
    w, h = Image.open(path).size
    ratio = w / h
    if not (1.70 <= ratio <= 1.86):
        return f"尺寸 {w}x{h}（{ratio:.2f}）不是 16:9 单帧——总览拼图不能当单帧量"
    return None


def vspan(im, bg):
    """视觉块高度：按行投影取最长连续有内容的行区间（比连通块稳，细笔画大字不会被拆碎）"""
    px = im.load()
    on = []
    for y in range(SH):
        cnt = 0
        for x in range(SW):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > TOL:
                cnt += 1
                if cnt > SW * 0.02:
                    break
        on.append(cnt > SW * 0.02)
    best = cur = 0
    for v in on:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best * (H / SH)


def measure(path, min_h):
    im = Image.open(path).convert("RGB").resize((SW, SH))
    bg = bg_of(im)
    (n, box), whole = largest_blob(im, bg)
    if not box:
        return {"file": os.path.basename(path), "fail": ["空帧：找不到主体"], "warn": []}
    x0, y0, x1, y1 = box
    k = W / SW
    px0, py0, px1, py1 = x0 * k, y0 * k, x1 * k, y1 * k
    bw = px1 - px0
    bh = max(py1 - py0, vspan(im, bg))
    cx = (px0 + px1) / 2
    fails, warns = [], []
    if bh < 80:
        fails.append(f"主体高 {bh:.0f} < 80：这一镜没有第一眼主体")
    elif bh < min_h:
        warns.append(f"主体高 {bh:.0f} < {min_h}：撑不到 45 帧就散")
    if px0 < EDGE or py0 < EDGE or (W - px1) < EDGE:
        fails.append(f"主体贴边：左 {px0:.0f} / 上 {py0:.0f} / 右距 {W - px1:.0f}（下限 {EDGE}）")
    if py1 > CAP_Y:
        fails.append(f"主体下沿 {py1:.0f} 进字幕带（{CAP_Y}）")
    cr = cap_ratio(im, bg)
    if cr > 0.005:
        fails.append(f"字幕带被占 {cr:.2%}")
    if whole:
        wcx = (whole[0] + whole[2]) / 2 * k
        if abs(wcx - CENTER) > 48:
            warns.append(f"整组内容中心 x={wcx:.0f}，偏 {abs(wcx - CENTER):.0f}px（组包围盒应居中于 {CENTER}）")
    return {
        "file": os.path.basename(path), "w": bw, "h": bh,
        "box": [round(px0), round(py0), round(px1), round(py1)],
        "fails": fails, "warns": warns,
    }


def main(argv):
    pos, min_h, js = [], 110, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--min" and i + 1 < len(argv):
            min_h = int(argv[i + 1]); i += 2; continue
        if a == "--json" and i + 1 < len(argv):
            js = argv[i + 1]; i += 2; continue
        pos.append(a); i += 1
    if len(pos) != 1:
        print(__doc__); return 2
    t = pos[0]
    files = [t] if os.path.isfile(t) else sorted(
        f for f in glob.glob(os.path.join(t, "*")) if f.lower().endswith(SUFFIX))
    if not files:
        print(f"没有帧：{t}"); return 2

    rows, nf, nw = [], 0, 0
    for f in files:
        bad = check_shape(f)
        if bad:
            r = {"file": os.path.basename(f), "w": 0, "h": 0, "fails": [bad], "warns": []}
        else:
            r = measure(f, min_h)
        rows.append(r)
        nf += len(r["fails"]); nw += len(r["warns"])
        tag = "FAIL" if r["fails"] else ("WARN" if r["warns"] else "ok")
        print(f"{tag:4s} {r['file']:28s} 主体 {r.get('h',0):.0f}px  宽 {r.get('w',0):.0f}px")
        for m in r["fails"]:
            print("      " + m)
        for m in r.get("warns", []):
            print("     " + m)
    if js:
        open(js, "w", encoding="utf-8").write(json.dumps(rows, ensure_ascii=False, indent=1))
        print("json ->", js)
    print(f"\nFRAME {len(files)} 帧 · {nf} fail · {nw} warn")
    return 1 if nf else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
