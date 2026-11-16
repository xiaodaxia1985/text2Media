"""从文章结构推出这十镜各自该"怎么拍"，而不是让人挑版式。

出图那边，图型是从「这条论断要证明什么关系」推出来的（timeline / delta / venn…）；
视频这边同理：每一镜该用哪种图文关系，取决于这一镜在讲什么事。
plan 里每张图已经写了 claim（它证明哪句话）、reads_as（读者该看见什么）、
figure_type、focal——这三样就是判断镜头语言的证据，不需要人再拍一遍脑袋。

    python shot_plan.py plan.json out.json [--headlines huang-headlines.json] [--max 26]

输出两件事：
  1. out.json —— 每镜的 layout / beat（这镜在干什么）/ why（为什么这套版式服务这句话）/ alt
  2. 同一份文件可以直接喂给 compose_layouts.py（它有 page / headline / layout 三个字段）

规则是可查的，不是"看着顺眼"：
  · 相邻两镜不许同版（同版就腻）
  · 首镜必须把整页立住（切页/开窗/出血/压边都不能打头）
  · 末镜收束用压边（"翻过去"的手感）
  · 长句不许塞进竖排单列，短句不许用双列竖排（撑不起来）
  · 全片至少一套竖排、一套重手法（切页/开窗/出血/巨号/压边）
  · 8 镜以上要有一次巨号编号当节奏点
"""
import json
import re
import sys
from pathlib import Path

from conclusions import squeeze

NUM = re.compile(r"\d+(?:\.\d+)?")
TIMEY = re.compile(r"[年月日]|夜里|凌晨|早上|晚上|上午|下午|当天")
CONTRAST = re.compile(r"不是|而是|反而|却|对上|旁边|对比|差")
DETAIL = re.compile(r"一角|细节|某个|局部|放大|一处|某一")
STRUCT = {"unit-grid", "kanban", "layers", "nested", "venn", "steps", "loop",
          "quadrant", "tree", "pyramid", "architecture", "swimlane", "org-chart"}
PROCESS = {"waterfall", "sankey", "journey", "timeline", "gantt", "sequence", "state"}

VERTICAL = {"C", "D", "E", "F", "J"}
HEAVY = {"G", "H", "I", "K", "L"}
OPEN = {"G", "H", "I", "L"}
ALL = "ABCDEFGHIJKL"

# 每种 beat 的候选版式，先写的先选；选完还要过下面的全局约束
BY_BEAT = {
    "起手": ["C", "B", "A"],
    "叙述": ["A", "B", "D"],
    "过程": ["D", "E", "B"],
    "对比": ["I", "J", "B"],
    "拆解": ["G", "H", "E", "J"],
    "给数": ["A", "H", "I", "B"],
    "收束": ["L", "I", "K"],
}

WHY = {
    "A": "页在左、字横排在右：这一镜先让人把页面读一遍，字只是跟着说",
    "B": "页在右、字在左：结论先出口，再用页面兑现",
    "C": "竖排单列贴着页缘：像在页边写批注，语气短、断得快",
    "D": "页在右、竖排在左：与上一镜的横排错开方向，画面立刻换气",
    "E": "竖排双列：句子本来就长，竖排能把它压成两条而不显得挤",
    "F": "页铺满、小字竖排在页外：这一镜页自己就是主角，字只做旁注",
    "G": "字块压进页右侧留白：字像从页里切出来，图文咬在一起",
    "H": "右下开窗放大：页面里那个细节值得再看一眼，用放大代替重讲",
    "I": "巨字出血贴边：这句话就是全片结论，字要大到压过页面",
    "J": "竖线分栏、字在左竖排：用一条线把两件事切开，转折有物理感",
    "K": "巨号编号垫底：只用它调节奏，隔几镜给观众一次呼吸",
    "L": "页面右侧出画、字在左竖排：收束时让画面前倾，像翻过去一页",
}


def beat_of(f, i, n):
    claim = f.get("claim", "")
    ft = f.get("figure_type", "")
    if i == 0:
        return "起手"
    if i == n - 1:
        return "收束"
    if CONTRAST.search(claim):
        return "对比"
    if ft in STRUCT:
        return "拆解"
    if ft in PROCESS:
        return "过程"
    if len(NUM.findall(claim)) >= 2 or ft in {"bar", "delta", "dumbbell", "unit-grid"}:
        return "给数"
    return "叙述"


def candidates(f, beat, text):
    cands = list(BY_BEAT[beat])
    hint = f.get("reads_as", "")
    if beat == "拆解" and DETAIL.search(hint):
        cands = ["H"] + [c for c in cands if c != "H"]
    if len(text) > 18:
        cands = [c for c in cands if c not in {"C", "D", "F"}] or ["E", "A"]
    elif len(text) <= 12:
        cands = [c for c in cands if c != "E"] or ["C", "K"]
        if beat in {"叙述", "起手"}:
            cands = ["C"] + [c for c in cands if c != "C"]
    return cands


def plan_shots(figs, headlines=None, max_len=26):
    n = len(figs)
    cap = 1 if n <= 12 else 2
    shots, used, prev = [], [], None
    for i, f in enumerate(figs):
        h = (headlines or {}).get(f.get("id")) or squeeze(f.get("claim", ""), max_len)
        beat = beat_of(f, i, n)
        cands = candidates(f, beat, h)
        pick = None
        for c in cands:
            if c == prev:
                continue
            if used.count(c) >= cap:
                continue
            pick = c
            break
        if pick is None:
            # 这一档的候选都用过了：换成全库里还没用过的，优先与句子长度相容的
            spare = [c for c in ALL if c not in used and c != prev]
            if len(h) > 18:
                spare = [c for c in spare if c not in {"C", "D", "F"}] or spare
            elif len(h) <= 12:
                spare = [c for c in {"C", "K", "F", "A", "B", "J"} if c in spare] or spare
            pick = spare[0] if spare else next((c for c in cands if c != prev), cands[0])
        # 首镜不许打头就切页/开窗/出血/压边
        if i == 0 and pick in OPEN:
            pick = next(c for c in cands if c not in OPEN) if any(c not in OPEN for c in cands) else "C"
        shots.append({
            "page": i + 1, "id": f.get("id"), "layout": pick, "beat": beat,
            "headline": h, "why": WHY[pick],
            "alt": [c for c in cands if c != pick][:2],
            "figure_type": f.get("figure_type"),
        })
        used.append(pick)
        prev = pick

    # 末镜的"收束"由 enforce() 统一处理（压边 or 出血）
    return shots


def of_last_ok(shot):
    return shot["layout"] in {"L", "I"}


def enforce(shots):
    n = len(shots)
    # 末镜压边
    if n >= 3 and shots[-1]["layout"] not in {"L", "I"}:
        prev = shots[-2]["layout"]
        shots[-1]["layout"] = "L" if prev != "L" else "I"
        shots[-1]["why"] = WHY[shots[-1]["layout"]]
    # 整套里必须各有一套：竖排 / 重手法
    if not any(s["layout"] in VERTICAL for s in shots):
        idx = next(i for i, s in enumerate(shots) if 0 < i < n - 1) if n >= 3 else 0
        shots[idx]["layout"] = "C"
        shots[idx]["why"] = WHY["C"]
    if not any(s["layout"] in HEAVY for s in shots):
        mid = min(range(n), key=lambda i: abs(i - n // 2) + (5 if i in (0, n - 1) else 0))
        shots[mid]["layout"] = "K"
        shots[mid]["why"] = WHY["K"]
    # 8 镜以上给一次巨号节奏点
    if n >= 8 and "K" not in {s["layout"] for s in shots}:
        mid = min(range(n), key=lambda i: abs(i - n // 2))
        shots[mid]["layout"] = "K"
        shots[mid]["why"] = WHY["K"]
    # 相邻同版消解
    for i in range(1, n):
        if shots[i]["layout"] == shots[i - 1]["layout"]:
            for alt in shots[i]["alt"] + ["D", "B", "J", "E", "A"]:
                if alt not in {shots[i - 1]["layout"]}:
                    shots[i]["layout"] = alt
                    shots[i]["why"] = WHY[alt]
                    break
    return shots


def check(shots):
    fails, warns = [], []
    n = len(shots)
    for i in range(1, n):
        if shots[i]["layout"] == shots[i - 1]["layout"]:
            fails.append(f"第 {i + 1} 镜与上一镜同版 {shots[i]['layout']}：连着两镜一个手法，观众会腻")
    if shots and shots[0]["layout"] in OPEN:
        fails.append(f"首镜用了 {shots[0]['layout']}：开场得先把整页立住")
    distinct = len({s["layout"] for s in shots})
    need = max(4, n // 2)
    if distinct < need:
        fails.append(f"全片只用了 {distinct} 套版，{n} 镜至少要 {need} 套")
    for s in shots:
        L = len(s["headline"])
        if L > 18 and s["layout"] in {"C", "D", "F"}:
            fails.append(f"第 {s['page']} 镜 {L} 字塞进竖排单列 {s['layout']}：竖排吃字，长句会顶出画面")
        if L <= 12 and s["layout"] == "E":
            warns.append(f"第 {s['page']} 镜只有 {L} 字却用双列竖排：两列撑不起来，建议改单列")
        if not s["why"]:
            fails.append(f"第 {s['page']} 镜没写 why：选版式必须说清它服务哪句话")
    if not any(s["layout"] in VERTICAL for s in shots):
        fails.append("全片没有一套竖排：横排铺到底，画面没有呼吸")
    if not any(s["layout"] in HEAVY for s in shots):
        warns.append("全片没有重手法（切页/开窗/出血/巨号/压边）：节奏太平")
    if n >= 8 and "K" not in {s["layout"] for s in shots}:
        warns.append("8 镜以上没给巨号编号：中间少了一次呼吸")
    return fails, warns


def main(argv):
    pos, headlines, max_len = [], {}, 26
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--headlines" and i + 1 < len(argv):
            path = Path(argv[i + 1])
            data = json.loads(path.read_text(encoding="utf-8"))
            rows = data if isinstance(data, list) else (data.get("pages") or data.get("shots") or [])
            for h in rows:
                if isinstance(h, dict) and h.get("id") and h.get("headline"):
                    headlines[h["id"]] = h["headline"]
            i += 2
            continue
        if a == "--max" and i + 1 < len(argv):
            max_len = int(argv[i + 1]); i += 2; continue
        pos.append(a); i += 1
    if len(pos) != 2:
        print(__doc__)
        return 2

    plan = json.loads(Path(pos[0]).read_text(encoding="utf-8"))
    figs = plan["figures"]
    shots = enforce(plan_shots(figs, headlines, max_len))

    out = {"meta": {"n": len(shots), "distinct": len({s["layout"] for s in shots}),
                    "order": " → ".join(s["layout"] for s in shots)}, "shots": shots}
    fails, warns = check(shots)
    Path(pos[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    for s in shots:
        print(f"{s['page']:02d} {s['layout']} {s['beat']:2s} {s['headline']}   〔{s['why']}〕")
    for w in warns:
        print("WARN  " + w)
    for f in fails:
        print("FAIL  " + f)
    print(f"\nSHOT {len(shots)} · 版式 {out['meta']['distinct']} 套 · 顺序 {out['meta']['order']}")
    print(f"{len(fails)} fail, {len(warns)} warn")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
