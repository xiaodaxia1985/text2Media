"""从 timing.json 的逐字时间戳找"一镜两拍"的第二拍起点。

map47 把相邻两句并成一镜，镜内常有两件事。第二拍起点 = 镜内最大的字间隙
（≥0.12s）之后那个字的时刻，相对镜首。输出 beatsplit.json：{"NN": 秒 | null}。

    python beatsplit.py video\dankoe-2027\remotion\src\timing.json video\dankoe-2027\remotion\src\beatsplit.json
"""
import json
import sys
from pathlib import Path

GAP = 0.12
LO, HI = 0.28, 0.78   # 第二拍只允许落在镜内 28%–78%


def main(argv):
    src, out = Path(argv[0]), Path(argv[1])
    timing = json.loads(src.read_text(encoding="utf-8"))
    split = {}
    for s in timing["scenes"]:
        chars = s.get("chars") or []
        dur = s["durationSec"]
        best, at = 0.0, None
        for i in range(1, len(chars)):
            gap = chars[i]["t"] - chars[i - 1]["e"]
            rel = chars[i]["t"] - s["startSec"]
            if gap < GAP:
                continue
            if not (LO * dur <= rel <= HI * dur):
                continue
            if gap > best:
                best, at = gap, rel
        split[s["id"]] = round(at, 2) if at is not None else None
    out.write_text(json.dumps(split, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for v in split.values() if v)
    print("BEATSPLIT %d 镜，%d 个有第二拍 → %s" % (len(split), n, out))
    for k, v in list(split.items())[:6]:
        print(" ", k, v)


if __name__ == "__main__":
    main(sys.argv[1:])
