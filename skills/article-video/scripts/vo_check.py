"""口播稿体检：从文章到口播稿那一层的机器可查部分。

    python vo_check.py talk.json --subject 黄仁勋 --article 原文.md
    python vo_check.py 稿.txt  --subject 黄仁勋 --article 原文.md

只查"机械能判"的部分，判不了的（讲没讲清楚、情绪对不对）留给人：
  R1 第一句必须是主体名首现，且句首不许是 他/她/它/其/该/这
  R2 单句 12–38 字（超出就是一口气说不完 / 太碎）
  R3 首词回指：第 2 句起，句首要能咬住上一句或被上一句逼出来的疑问
  R4 稿子里不许混 markdown 标记（配音会念出来）
  R5 数字口径：阿拉伯数字必须在原文出现
  R6 时长估算：4.2 字/秒 + 0.35s 一句停顿；≤90s 通过、90–120s WARN（语速可调，按实际渲染定）、>120s FAIL

**去 AI 味不在这里查。** 词表判断（空话、黑话、书面连接词）一律交给
`skills/lieflat-less-ai-tone`（detect.py 分级报告 + 语义层判读）；本脚本自建词表
会跟那边的实测结论打架（"赋能/闭环/抓手" 在那里是 X 级、永不改）。
本脚本只管结构：谁开口、一句多长、接没接上、数字有没有出处。
"""
import json
import re
import sys
from pathlib import Path

# R1 句首禁止的指代
BAD_LEAD = ("他", "她", "它", "其", "该", "这位", "此人")
# R3 允许的承接连词（不算"跳"）
CONNECT = ("所以", "而且", "但是", "但", "可", "也", "还有", "另一头", "另外", "于是",
           "接着", "然后", "最后", "说到底", "换句话说", "也就是说", "这", "那", "而")
# 去 AI 味词表不在这里：那是 skills/lieflat-less-ai-tone 的活（detect.py 分级 + 语义层）
# R7 动作 + 数量必须带对象：「裁掉七成」听众不知道七成是什么，这是口播稿里最像 AI 的省略
OBJ_MISS = re.compile(
    r"(裁掉|裁了|砍掉|砍了|涨了|涨|跌了|跌|翻了|翻|省了|省下|多了|少了|减了|加了|降了)"
    r"([一二三四五六七八九十百千万亿两\d][一二三四五六七八九十百千万亿两\d\.]*(成|倍|个百分点|%|万|亿))"
    r"(?=[，。！？；：、…,\.\s]|$)")
PUNCT = "，。！？；：、…—\u201c\u201d\u2018\u2019（）()\"' ,.!?;:"
# 下限放到 6：全篇都是 26–36 字会把节奏写"齐"——detect.py 实测句长 CV 0.314（人类中位 0.54）
MIN_L, MAX_L = 6, 38
RATE, GAP = 4.2, 0.35


def clean(s):
    return "".join(ch for ch in s if ch not in PUNCT)


def split_units(path):
    p = Path(path)
    raw = p.read_text(encoding="utf-8")
    if p.suffix.lower() == ".json":
        obj = json.loads(raw)
        units = obj.get("pages") or obj.get("lines") or obj.get("shots") or obj
        out = []
        for i, u in enumerate(units, 1):
            if isinstance(u, str):
                out.append(("", u))
            else:
                out.append((u.get("id") or f"{i:02d}", u.get("line") or u.get("text") or ""))
        return [(a, b) for a, b in out if b.strip()]
    return [(f"{i:02d}", ln.strip()) for i, ln in enumerate(
        [x.strip() for x in raw.splitlines() if x.strip()], 1)]


def main(argv):
    pos, opt = [], {}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv):
            opt[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i]); i += 1
    if not pos:
        print(__doc__); return 2

    subject = opt.get("subject") or ""
    article = Path(opt["article"]).read_text(encoding="utf-8") if opt.get("article") else ""

    units = split_units(pos[0])

    prev = ""
    fails, warns, notes = [], [], []
    for idx, (uid, line) in enumerate(units, 1):
        body = clean(line)
        n = len(body)
        if idx == 1:
            if subject and subject not in line:
                fails.append(f"{uid} 第一句没出现主体名「{subject}」：观众不知道「他」是谁")
            if line.startswith(BAD_LEAD):
                fails.append(f"{uid} 第一句以「{line[:2]}」开头：主语还没立起来就用指代")
        else:
            if line.startswith(BAD_LEAD) and subject and subject not in line:
                pass  # 第二次之后允许，但下面 R3 会查它有没有承接
        if n < MIN_L:
            warns.append(f"{uid} 只有 {n} 字：太碎，像字幕不像话，考虑并入上一句")
        elif n > MAX_L:
            fails.append(f"{uid} {n} 字 > {MAX_L}：一口气说不完，配音会被迫加速（删到 35 字以内）")

        if idx > 1 and prev:
            lead = body[:4]
            hit = any(lead[:k] and lead[:k] in prev for k in range(4, 0, -1))
            conn = any(lead.startswith(c) for c in CONNECT)
            if not hit and not conn:
                notes.append(
                    f"{uid} 开头「{lead}」字面没咬住上一句（上一句尾「{prev[-10:]}」）——"
                    f"人工确认一次：语义上回指就行，真跳就改")

        if any(fid in line for fid in ("**", "##", "|", ">")):
            fails.append(f"{uid} 稿子里混了 markdown 标记：配音会念出来")

        for m in OBJ_MISS.finditer(line):
            notes.append(
                f"{uid} 「{m.group(0)}」数量后面没跟对象（如「裁掉七成」→「裁掉七成员工」）——"
                f"观众听不懂七成是什么，这是最像 AI 的一类省略")

        if article:
            for num in re.findall(r"\d+(?:\.\d+)?", line):
                if num not in article:
                    warns.append(f"{uid} 数字 {num} 原文没有：要么改口径，要么在稿里说明来源")

        prev = body

    chars = sum(len(clean(l)) for _, l in units)
    est = chars / RATE + GAP * len(units)
    if est > 120:
        fails.append(f"估时 {est:.0f}s > 120s：按 4.2 字/秒已经念不动了，砍句或拆两集，别靠加速硬塞")
    elif est > 90:
        warns.append(
            f"估时 {est:.0f}s 超 90s（4.2 字/秒口径）：过审前确认一次语速——"
            f"1.2 倍速约 {est / 1.2:.0f}s、1.5 倍速约 {est / 1.5:.0f}s，按实际渲染定，别为凑时长砍句")
    elif est > 75:
        warns.append(f"估时 {est:.0f}s 偏长（75s 以上观众开始走）")

    for s in units:
        print(f"  {s[0]:>3}  {s[1]}")
    for n in notes:
        print("NOTE  " + n)
    for w in warns:
        print("WARN  " + w)
    for f in fails:
        print("FAIL  " + f)
    print(f"\nVO {len(units)} 句 · {chars} 字 · 估 {est:.0f}s · {len(fails)} fail {len(warns)} warn {len(notes)} note")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
