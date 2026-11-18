# -*- coding: utf-8 -*-
"""把「句子级口播 + 句→镜映射」合成 Remotion 的 timing.json。

两种输入形态：
  · 有配音对齐（alignment.json，voice.mjs 产物，scenes 按句）：取真实 start/end 与逐字时间；
  · 还没有配音（--estimate）：按 4.2 字/秒 + 0.15s 气口估，让骨架先能渲。

    python build_timing.py talk.json map47.json timing.json [--alignment alignment.json] [--fps 30]

talk.json  : {"pages":[{"id","headline","line"}]}   —— 76 句
map47.json : {"shots":[{"id","p":[句号(1 起),…]}]}  —— 47 镜
timing.json: {"totalSec","scenes":[{"id","text","startSec","durationSec","chars":[{"ch","t","e"}]}]}
"""
import json
import re
import sys
from pathlib import Path

STRIP = re.compile(r"[，。、：；！？…「」『』\"'“”‘’\s（）()·—\-]")
RATE = 4.2
GAP = 0.15


def chars_of(s):
    return len(STRIP.sub("", s))


def main(argv):
    alignment = None
    if "--alignment" in argv:
        i = argv.index("--alignment")
        alignment = Path(argv[i + 1]).resolve()
    pos = [a for a in argv if not a.startswith("--")]
    if alignment is not None:
        pos.remove(argv[i + 1])  # 按 argv 原值移除（alignment 已 resolve 成绝对路径，比不了）
    estimate = "--estimate" in argv
    if len(pos) < 3:
        print(__doc__)
        return 2
    talk_p, map_p, out_p = (Path(p).resolve() for p in pos[:3])
    pages = json.loads(talk_p.read_text(encoding="utf-8"))["pages"]
    shots = json.loads(map_p.read_text(encoding="utf-8"))["shots"]

    # 句号(1 起) → 句子
    lines = {i + 1: p["line"] for i, p in enumerate(pages)}

    al = None
    if alignment and alignment.exists():
        al = json.loads(alignment.read_text(encoding="utf-8"))["scenes"]

    scenes, cursor = [], 0.0
    for sh in shots:
        text, chars = "", []
        start, end = None, None
        for n in sh["p"]:
            n = int(n)  # 映射表里句号可能写成 "01"
            line = lines[n]
            text += line
            if al:
                seg = al[n - 1]
                s0, e0 = seg["start"], seg["end"]
                ch = [{"ch": c, "t": round(t, 3), "e": round(e, 3)} for c, (t, e) in zip(line, seg["lines"][0]["chars"])]
            else:
                s0 = cursor
                per = (1 / RATE)
                ch = []
                t = s0
                for c in line:
                    d = 0 if STRIP.fullmatch(c) else per
                    ch.append({"ch": c, "t": round(t, 3), "e": round(t + d, 3)})
                    t += d
                e0 = t
                cursor = e0 + GAP
            start = s0 if start is None else start
            end = e0
            chars.extend(ch)
        scenes.append({
            "id": sh["id"],
            "text": text,
            "startSec": round(start, 3),
            "durationSec": round(end - start, 3),
            "chars": chars,
        })
        if al:
            cursor = max(cursor, end)

    total = round(scenes[-1]["startSec"] + scenes[-1]["durationSec"] + 0.4, 3)
    out = {"totalSec": total, "scenes": scenes}
    out_p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"TIMING {len(scenes)} 镜 · 总长 {total:.2f}s · 源 {'alignment' if al else '估算'}")
    for s in scenes[:3] + scenes[-2:]:
        print(f"  {s['id']} {s['startSec']:7.2f} +{s['durationSec']:5.2f}  {s['text'][:22]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
