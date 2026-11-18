"""rhythm_check.py — 长片版式节奏闸门（判据全部来自 references/long-form-rhythm.md 四/五/六节）

把一个 specs.ts 读成「骨架 / 体量 / 方向」三列，再按配额逐条判 FAIL。
它只管「镜与镜之间是否撞脸」，不管单镜好不好看；主体占比要另一支 frame_max_object.py 实测。

    python rhythm_check.py --specs <specs.ts> --data <data.ts> [--chapters 9] [--brief]

骨架→族的映射取 20 族的既定形态（families.tsx 注释即依据），换任何一篇都通用：
    横轴  A I Q L       竖轴  H R S N G
    网格  J T K O       环    E
    单点  M D P         满版  B
    分栏  C

依赖：无（纯标准库）。
"""
import argparse
import math
import re
import sys
from pathlib import Path

SKEL_OF = {
    # 横轴：一条轴从一侧贯到另一侧，节点沿轴排
    "A": "横轴", "I": "横轴", "Q": "横轴", "L": "横轴",
    # 竖轴：自上而下分层，层与层有承接；G 与 S 是落差变体
    "H": "竖轴", "R": "竖轴", "S": "竖轴", "N": "竖轴", "G": "竖轴",
    # 网格：N×M 并列块
    "J": "网格", "T": "网格", "K": "网格", "O": "网格",
    # 环 / 单点 / 满版 / 分栏
    "E": "环",
    "M": "单点", "D": "单点", "P": "单点",
    "B": "满版",
    "C": "分栏",
}
DIR_OF = {"横轴": "H", "竖轴": "V", "网格": "G", "环": "O", "单点": "P", "满版": "F", "分栏": "C"}


def parse_specs(path):
    txt = Path(path).read_text(encoding="utf-8")
    shots = []
    # 注释行给出镜号与句子，下一行是 spec 对象
    for m in re.finditer(r"//\s*(\d{2})\s*([^\n]*)\n\s*\{[^\n]*?fam:\s*'(\w)'([^\n]*)", txt):
        sid, title, fam, rest = m.group(1), m.group(2).strip(), m.group(3), m.group(4)
        vm = re.search(r"variant:\s*'([^']*)'", rest)
        labels = []
        lm = re.search(r"labels:\s*\[([^\]]*)\]", rest)
        if lm:
            labels = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", lm.group(1))]
        shots.append({"id": sid, "title": title, "fam": fam, "variant": vm.group(1) if vm else "", "labels": labels})
    return shots


def parse_data(path):
    txt = Path(path).read_text(encoding="utf-8")
    frames = {}
    for blk in re.split(r'"shot"\s*:\s*"', txt)[1:]:
        sid = blk[:2]
        fm = re.search(r'"frames"\s*:\s*(\d+)', blk)
        if fm:
            frames[sid] = int(fm.group(1))
    return frames


def mass_of(fam, frames, labels):
    """S 满版重击 / M 中景主图 / D 细节快切。B 恒为 S；≤90 帧（3s）为 D；其余 M。"""
    if fam == "B":
        return "S"
    if frames and frames <= 90:
        return "D"
    return "M"


def check(shots, frames, chapters):
    n = len(shots)
    rows, fails, warns = [], [], []
    for s in shots:
        s["frames"] = frames.get(s["id"], 0)
        s["skel"] = SKEL_OF.get(s["fam"], "?")
        s["dir"] = DIR_OF.get(s["skel"], "?")
        s["mass"] = mass_of(s["fam"], s["frames"], s["labels"])

    # 章：按镜数平均切，避免依赖 tag（tag 只有部分镜有）
    ch = max(1, chapters)
    per = math.ceil(n / ch)
    for i, s in enumerate(shots):
        s["ch"] = min(ch, i // per + 1)

    # ── 配额（第四节）──
    cnt = {}
    for s in shots:
        cnt[s["skel"]] = cnt.get(s["skel"], 0) + 1
    cap = {
        "横轴": 2,
        "环": 2,
        "分栏": 2,
        "竖轴": math.ceil(n / 6),
    }
    for k, v in cap.items():
        if cnt.get(k, 0) > v:
            fails.append(f"配额：{k} {cnt.get(k)} 次 > 上限 {v}")
    for k in ("横轴", "环", "分栏"):
        if cnt.get(k, 0) == 0:
            warns.append(f"配额：{k} 一次都没用（库里可用，缺它整片会单一）")

    # ── S / D 档 ──
    s_cnt = sum(1 for s in shots if s["mass"] == "S")
    s_need = math.ceil(n / 9)
    if s_cnt < s_need:
        fails.append(f"S 档 {s_cnt} 个 < 应需 ceil({n}/9)={s_need}（每章界一个满版重击）")
    for i in range(1, n):
        if shots[i]["mass"] == "S" and shots[i - 1]["mass"] == "S":
            fails.append(f"S 档相邻：{shots[i-1]['id']}/{shots[i]['id']}（重击连着来就不叫重击）")
    for c in range(1, ch + 1):
        d_cnt = sum(1 for s in shots if s["ch"] == c and s["mass"] == "D")
        if d_cnt < 1:
            warns.append(f"第 {c} 章没有 D 档（细节快切），全章都是中景")
        elif d_cnt > 2:
            fails.append(f"第 {c} 章 D 档 {d_cnt} 个 > 2（轻拍太多会碎）")

    # ── 连续性（第五节）──
    for i in range(1, n):
        if shots[i]["fam"] == shots[i - 1]["fam"]:
            if shots[i]["variant"] and shots[i]["variant"] != shots[i - 1]["variant"]:
                warns.append(f"连续同族但换了形态：{shots[i-1]['id']}→{shots[i]['id']} {shots[i]['fam']} "
                             f"{shots[i-1]['variant'] or '默认'}→{shots[i]['variant']}（形态确实变了，只提醒）")
            else:
                fails.append(f"连续同族同形态：{shots[i-1]['id']} 与 {shots[i]['id']} 都是 {shots[i]['fam']}")
    for i in range(2, n):
        if shots[i]["dir"] == shots[i - 1]["dir"] == shots[i - 2]["dir"]:
            fails.append(f"连续三镜同方向：{shots[i-2]['id']}/{shots[i-1]['id']}/{shots[i]['id']} 都是 {shots[i]['dir']}")

    # ── 每章方向种类 ≥4（章内 ≥6 镜时）──
    for c in range(1, ch + 1):
        k = sum(1 for s in shots if s["ch"] == c)
        d = len({s["dir"] for s in shots if s["ch"] == c})
        if k >= 6 and d < 4:
            fails.append(f"第 {c} 章 {k} 镜只有 {d} 种方向（要 ≥4）")

    # ── 每 5–6 镜一次全幅变化 ──
    last_full = -99
    for i, s in enumerate(shots):
        if s["mass"] in ("S", "D") or s["skel"] == "满版":
            last_full = i
        elif i - last_full >= 6:
            warns.append(f"{s['id']} 之前已连续 {i-last_full} 镜无 S/D 档，全幅变化断了")
            last_full = i

    # ── 单镜帧数（配音前估值，只提醒）──
    for s in shots:
        if 0 < s["frames"] < 120:
            warns.append(f"{s['id']} 只有 {s['frames']} 帧（<120）：长片里的短镜要么是 D 档、要么会显得闪一下")
    return shots, cnt, cap, s_cnt, s_need, fails, warns


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--specs", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--chapters", type=int, default=9)
    ap.add_argument("--brief", action="store_true", help="只打违规，不打 76 行明细")
    a = ap.parse_args(argv)

    shots, cnt, cap, s_cnt, s_need, fails, warns = check(
        parse_specs(a.specs), parse_data(a.data), a.chapters)

    print(f"\n== 骨架分布（{len(shots)} 镜）==")
    for k in ("横轴", "竖轴", "网格", "环", "单点", "满版", "分栏"):
        c = cnt.get(k, 0)
        lim = cap.get(k)
        flag = f"上限 {lim} → {'超' if lim and c > lim else 'OK'}" if lim else "不设上限"
        print(f"  {k:4s} {c:3d}  {flag}")
    print(f"  S 档 {s_cnt} 个（应需 {s_need}）")

    if not a.brief:
        print(f"\n== 逐镜 ==")
        print(f"  {'镜':4s}{'族':4s}{'骨架':6s}{'体量':4s}{'方向':4s}{'帧':6s}{'章':3s} 句子")
        for s in shots:
            print(f"  {s['id']:4s}{s['fam']:4s}{s['skel']:6s}{s['mass']:4s}{s['dir']:4s}{s['frames']:<6d}{s['ch']:<3d} {s['title'][:26]}")

    print(f"\n== 违规 ==")
    for w in warns:
        print("WARN  " + w)
    for f in fails:
        print("FAIL  " + f)
    print(f"\nRHYTHM {len(shots)} 镜 · {len(fails)} fail · {len(warns)} warn")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
