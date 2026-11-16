"""把 plan 里每页的 claim 压成一句屏幕大字。

屏幕大字不是手写项：plan 里每张图本来就有 claim（这张图证明的那句话），
这里只做机械压缩，规则三条：
1. 先砍掉开头的时间标记（「11 月 12 日夜里」这种），它撑不起一句结论
2. 在逗号/顿号边界上取最长且不超过上限的窗口，不切断词
3. 窗口尾巴是「生态」「渠道」这种两三个字的拖尾 → 砍掉，避免悬空

    python conclusions.py plan.json out.json [--max 26]
"""
import json
import re
import sys
from pathlib import Path

HARD = re.compile(r"[；;。]")
SOFT = re.compile(r"[，,、]")
TIMEY = re.compile(r"[年月日]|夜里|凌晨|早上|晚上|上午|下午|当天")


def is_time_marker(seg):
    return len(seg) <= 12 and bool(TIMEY.search(seg))


def squeeze(claim, max_len):
    claim = claim.strip().rstrip("。")
    main = HARD.split(claim)[0].strip()
    parts = [p.strip() for p in SOFT.split(main) if p.strip()]
    while parts and len(parts) > 1 and is_time_marker(parts[0]):
        parts.pop(0)

    best = None
    for i in range(len(parts)):
        acc = ""
        for j in range(i, len(parts)):
            cand = parts[j] if not acc else acc + "，" + parts[j]
            if len(cand) > max_len:
                break
            acc = cand
            if best is None or (len(acc), -i) > (len(best), -0):
                best = acc
    if not best:
        return main[:max_len].rstrip("，、")
    # 砍掉两三个字的拖尾（「生态」「渠道」这种半截列举）
    while True:
        segs = SOFT.split(best)
        if len(segs) > 1 and len(segs[-1]) <= 3 and len(best) - len(segs[-1]) - 1 >= 8:
            best = "，".join(segs[:-1])
        else:
            break
    return best


def main(plan_path, out_path, max_len):
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    rows = []
    for i, f in enumerate(plan["figures"], 1):
        claim = f.get("claim") or ""
        line = squeeze(claim, max_len)
        rows.append({"page": i, "id": f.get("id"), "figure_type": f.get("figure_type"), "headline": line, "chars": len(line)})
        print(f"{i:02d} {f.get('figure_type'):<10} {len(line):>2} 字  {line}")
    Path(out_path).write_text(json.dumps({"max": max_len, "pages": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", out_path, len(rows), "条")
    return 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    mx = 26
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] == "--max" and i + 1 < len(argv):
            mx = int(argv[i + 1]); i += 2; continue
        pos.append(argv[i]); i += 1
    if len(pos) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(pos[0], pos[1], mx))
