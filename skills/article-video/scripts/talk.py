"""口播与大字必须是同一句：先定「这一镜开口说什么」，再让屏幕只显示这句的开头。

问题出在哪：图解页是给人读的，页首有自己的 h1；视频又在边上叠一句提炼大字；
口播还是第三套说法。一屏三套字，观众听到的、看到的、图上写着的都不是同一件事，
看下来必然云里雾里。

所以视频的文本只有一套源头：`talk.json` 里每镜一句口播，屏幕大字**逐字取这句的开头**。
听完一句，看到的就是这句的前半截——不需要观众自己做对齐。

    python talk.py talk.json --headlines out-headlines.json [--max-head 16] [--max-line 30]

talk.json:
    {"pages": [{"id": "03-trust", "headline": "信托一次办三件事",
                "line": "信托一次办三件事：锁股权，隔资产，避遗产税。"}]}

判错：
  · 大字不是口播的逐字开头（去标点比对）—— 那观众就得自己对齐两条线
  · 大字 > max-head（屏幕一行放不下）或口播 > max-line（一镜一口气说不完）
  · 同一镜里出现第二个句号级分句堆叠（口播一镜只讲一件事）
"""
import json
import re
import sys
from pathlib import Path

STRIP = re.compile(r"[，。、：；！？…「」『』\"'“”‘’\s（）()·—\-]")
SECOND_CLAUSE = re.compile(r"[。！？]")


def norm(s):
    return STRIP.sub("", s)


def chars_per_sec(rate=4.2):
    return rate


def check(pages, max_head=16, max_line=30, rate=4.2):
    fails, warns = [], []
    for p in pages:
        pid, h, line = p.get("id", "?"), p.get("headline", ""), p.get("line", "")
        if not h or not line:
            fails.append(f"{pid}: headline / line 缺一个——屏幕说什么、口播说什么必须都写清")
            continue
        nh, nl = norm(h), norm(line)
        if not nl.startswith(nh):
            head = nl[:len(nh)]
            fails.append(f"{pid}: 大字「{h}」不是口播的开头（口播开头是「{head}」）——观众得自己对两条线")
        if len(nh) > max_head:
            fails.append(f"{pid}: 大字 {len(nh)} 字 > {max_head}，屏幕一行放不下")
        if len(nl) > max_line:
            warns.append(f"{pid}: 口播 {len(nl)} 字 > {max_line}，这一镜会喘不上气（改短或拆两拍）")
        if len(SECOND_CLAUSE.findall(line)) > 1:
            fails.append(f"{pid}: 口播有 {len(SECOND_CLAUSE.findall(line))} 个句级停顿——一镜只讲一件事")
    total = sum(len(norm(p.get("line", ""))) for p in pages)
    est = total / rate + 0.35 * len(pages)
    return fails, warns, est


def main(argv):
    pos, heads_path, max_head, max_line = [], None, 16, 30
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--headlines" and i + 1 < len(argv):
            heads_path = Path(argv[i + 1]); i += 2; continue
        if a == "--max-head" and i + 1 < len(argv):
            max_head = int(argv[i + 1]); i += 2; continue
        if a == "--max-line" and i + 1 < len(argv):
            max_line = int(argv[i + 1]); i += 2; continue
        pos.append(a); i += 1
    if len(pos) != 1:
        print(__doc__)
        return 2

    data = json.loads(Path(pos[0]).read_text(encoding="utf-8"))
    pages = data.get("pages") or data.get("shots") or data
    fails, warns, est = check(pages, max_head, max_line)

    if heads_path:
        heads_path.write_text(json.dumps(
            {"pages": [{"id": p["id"], "headline": p["headline"]} for p in pages]},
            ensure_ascii=False, indent=1), encoding="utf-8")

    for p in pages:
        print(f"{p['id']:12s} 大字 {len(norm(p['headline'])):2d} 字 · 口播 {len(norm(p['line'])):2d} 字  {p['headline']}")
    for w in warns:
        print("WARN  " + w)
    for f in fails:
        print("FAIL  " + f)
    print(f"\nTALK {len(pages)} 镜 · 口播 {sum(len(norm(p['line'])) for p in pages)} 字 · 估 {est:.0f}s（4.2 字/秒 + 停顿）")
    print(f"{len(fails)} fail, {len(warns)} warn")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
