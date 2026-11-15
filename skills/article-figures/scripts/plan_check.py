"""Audit a figure plan against the source article.

    python plan_check.py plan.json <article.md> [--min 3] [--max 30]

Catches the four ways a plan lies — an anchor quote the article never said,
a number the article never gave, a figure past the complexity budget, and
(once `blocks` is in the plan) content that was parsed and then quietly
dropped — plus the one way a figure *set* lies: two figures of the same type
drawn the same.

Coverage is the newest check (2026-11-16). An article is cut into blocks —
the smallest unit that can stand on its own — and every block declares
whether it could be drawn. A drawable block that no page picks up is a FAIL,
because that is exactly how a "6-page" set ends up covering half an article
while looking complete.

Figure count is NOT a constant. With `blocks` present the count falls out of
the page plan; without it, the old length band stays as a compatible fallback.
"""
import json
import re
import sys
from pathlib import Path

TYPES = {
    "timeline", "waterfall", "layers", "loop", "quadrant", "steps", "venn",
    "bar", "line", "scatter", "sankey", "flowchart", "tree", "pyramid",
    "heatmap", "treemap", "gantt", "radar", "delta", "nested", "state",
    "sequence", "architecture", "swimlane", "polar", "org-chart", "kanban",
    "journey", "dumbbell", "unit-grid", "story-map", "fishbone", "quote",
}
# 一张页最多接几块：超过就不是"一页一件事"，是在拿一页代替多页
BLOCK_CAP = 3
BLOCK_CAP_SAMEGRP = 9
# 一套图的软上限，按发布形态分（单页插图 vs 平台连载）
SCALE_CAP = {"web": 20, "serial": 30}

HONESTY_WORDS = ("推断", "反推", "原文未给", "原文未直接给出", "残差", "假设")
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
STRIP_RE = re.compile(r"[*_`#>\[\]（）()「」『』\"'“”‘’\s,，.。:：;；!！?？、|—-]")


def norm(text):
    return STRIP_RE.sub("", text)


def find(quote, body):
    q = norm(quote)
    return bool(q) and q in body


def numbers_in(obj):
    out = []
    if isinstance(obj, dict):
        for v in obj.values():
            out += numbers_in(v)
    elif isinstance(obj, list):
        for v in obj:
            out += numbers_in(v)
    elif isinstance(obj, str):
        out += NUMBER_RE.findall(obj)
    return out


def count_band(chars, policy, value=None, lo_override=None, hi_override=None, density=(300, 600)):
    """Where the figure count should land for an article of this length.

    One figure per evidence-bearing claim; in dense analytical Chinese prose
    a claim worth drawing shows up roughly every 300–600 characters (news
    roundups are sparser, ~1000+). The band is advisory only — a 3-figure
    teaser and a 20-figure chaptered set are both legitimate, and only the
    author knows which one is wanted.
    """
    d_lo, d_hi = density
    lo = max(1, round(chars / d_hi))
    hi = max(lo + 1, round(chars / d_lo))
    if policy == "fixed" and value:
        lo = hi = int(value)
    if lo_override:
        lo = lo_override
    if hi_override:
        hi = hi_override
    return lo, hi


def check_structure(plan, figs, fails, warns, policy="structure", has_blocks=False):
    """张数由文章结构决定，不由字数决定。

    `article_map` 是全文拆分表：每一节写清这节讲什么、能不能被图证明、落到哪几张图；
    不能画的节必须写 reason。于是 figure 的数量是这张表的自然结果：
    有证据的节点多，图就多；作者删掉的节点多，图就少。

    有 `blocks`（块级表）时，article_map 退化成"块的分组视图"：一节有几张图由块决定，
    不再受"一节最多两张"这类节级经验值约束。
    """
    amap = plan.get("article_map") or []
    if not amap:
        msg = (
            "没有 article_map：张数必须从全文结构推出来。先把全文拆成若干节，每节写 "
            "section / claim / figures（图 id 列表，不画的写空数组）/ reason（不画的原因），"
            "张数会自动等于这张表的结果"
        )
        (fails if policy == "structure" else warns).append(msg)
        return

    ids = [f.get("id", "?") for f in figs]
    claimed = {}
    for unit in amap:
        sec = unit.get("section") or "(未命名节)"
        fs = unit.get("figures") or []
        if not fs and not (unit.get("reason") or "").strip():
            fails.append(f"article_map 「{sec}」没配图也没写 reason：不画要说清为什么，否则等于漏了一段")
        if len(fs) > 2 and not has_blocks:
            warns.append(f"article_map 「{sec}」配了 {len(fs)} 张图：一节很少能撑起两张以上，先看是不是该拆节")
        for fid in fs:
            if fid in claimed:
                fails.append(f"图 {fid} 在 article_map 里出现了两次（{claimed[fid]} / {sec}）")
            claimed[fid] = sec

    for fid in ids:
        if fid not in claimed:
            fails.append(f"图 {fid} 没出现在 article_map 里：它证明的是哪一节？")
    for fid in claimed:
        if fid not in ids:
            fails.append(f"article_map 引用了不存在的图 {fid}")

    total = sum(len(u.get("figures") or []) for u in amap)
    if total != len(figs):
        fails.append(f"article_map 里的图合计 {total} 张，figures 实际 {len(figs)} 张：账对不上")
    scale = plan.get("scale") or "web"
    cap = SCALE_CAP.get(scale, 20)
    if len(figs) > cap and (plan.get("count_policy") or {}).get("mode") != "split":
        warns.append(
            f"本文出了 {len(figs)} 张：超过 {scale} 口径的软上限 {cap}，建议按批次分卷（count_policy.mode=split）"
        )
    if not has_blocks and not any((u.get("figures") or []) == [] for u in amap):
        warns.append("article_map 里每一节都配了图：一篇文章很少节节能画，检查是不是漏了删减")


def load_blocks(plan, plan_dir):
    """块表可以是内嵌的，也可以是 plan 旁边的一个文件（同一篇复用一份）。"""
    if plan.get("blocks"):
        return plan["blocks"], "inline"
    bf = plan.get("blocks_file")
    if bf:
        p = Path(plan_dir) / bf
        if not p.exists():
            return None, f"blocks_file 指向的文件不存在：{p}"
        return json.loads(p.read_text(encoding="utf-8")).get("blocks", []), str(p)
    return None, None


def check_coverage(plan, raw, fails, warns):
    """块级覆盖：解析出来的每一块，要么落到某页上，要么说清为什么不画。

    没有这一条，plan 里"每张图都能在表里找到归属"仍然成立，但表本身可以
    只登记被画掉的那几块 —— 6 页覆盖半篇文章，看起来依然 0 fail。
    """
    blocks, src = load_blocks(plan, Path(plan.get("_path", ".")).parent)
    if blocks is None:
        if plan.get("blocks") or plan.get("blocks_file"):
            # 声明了块表却读不到：不能默默跳过覆盖检查，否则整道闸等于不存在
            fails.append(f"块表读不到（{src}）：覆盖校验无法执行")
        return None
    if not blocks:
        fails.append("blocks 是空数组：声明了块级表却没有块，覆盖校验无从判起")
        return None
    lines = raw.splitlines()
    nlines = len(lines)
    ids = {f.get("id", "?") for f in plan.get("figures", [])}
    pages = plan.get("pages") or []

    # 一页接了哪些块：优先看 pages[].blocks，退化为 blocks[].page
    per_page = {p["id"]: list(p.get("blocks") or []) for p in pages if p.get("id")}
    if not per_page:
        for b in blocks:
            if b.get("page"):
                per_page.setdefault(b["page"], []).append(b["id"])
    known = {b["id"] for b in blocks}

    for pid, bids in per_page.items():
        if pid not in ids:
            fails.append(f"页 {pid} 不在 figures 里：页面和图的 id 必须一一对应")
        for bid in bids:
            if bid not in known:
                fails.append(f"页 {pid} 引用了不存在的块 {bid}")

    covered = set()
    for b in blocks:
        tag = b.get("id", "?")
        ln = b.get("line") or []
        if not ln or len(ln) != 2:
            fails.append(f"{tag}: 缺 line 区间，没法回查这段在原文哪里")
        else:
            a, z = int(ln[0]), int(ln[1])
            if not (1 <= a <= z <= nlines):
                fails.append(f"{tag}: line {a}–{z} 超出原文 {nlines} 行")
        anchor = b.get("anchor")
        if anchor and not find(anchor, norm(raw)):
            fails.append(f"{tag}: anchor 在原文里查不到 —— 可能是编的")
        if b.get("figure") and not anchor:
            warns.append(f"{tag}: 能画的块没写 anchor —— 这一块的原文依据没锁，图容易被画成印象")
        if not b.get("figure"):
            if not (b.get("why") or "").strip():
                warns.append(f"{tag}: 标了不可画，但没写去向（引文页 / 脚注 / 不画）")
            continue
        hit = [pid for pid, bids in per_page.items() if tag in bids]
        if not hit:
            fails.append(
                f"{tag} L{ln[0] if ln else '?'}: 能画，却没有任何一页接住它 —— 「{b.get('claim', '')[:40]}」"
            )
            continue
        covered.add(tag)

    # 一页接太多块 = 一页代替多页；同组例外（一张结构页本来就由多块拼成）
    by_id = {b["id"]: b for b in blocks}
    for pid, bids in per_page.items():
        n = len(bids)
        if n <= BLOCK_CAP:
            continue
        grps = {by_id.get(b, {}).get("grp") for b in bids}
        if len(grps) == 1 and n <= BLOCK_CAP_SAMEGRP:
            continue
        if n > BLOCK_CAP_SAMEGRP:
            fails.append(f"页 {pid} 接了 {n} 块：超过 {BLOCK_CAP_SAMEGRP} 块，任何一页都装不下，必须拆页")
        else:
            warns.append(f"页 {pid} 接了 {n} 块（来自 {len(grps)} 个断言组）：超过 {BLOCK_CAP} 块，先看是不是该拆页")

    drawable = [b for b in blocks if b.get("figure")]
    groups = {b.get("grp") for b in blocks if b.get("grp")}
    return {
        "blocks": len(blocks),
        "drawable": len(drawable),
        "covered": len(covered),
        "gap": len(drawable) - len(covered),
        "notes": len(blocks) - len(drawable),
        "groups": len(groups),
        "pages": len(per_page),
        "min_pages": -(-len(drawable) // BLOCK_CAP),
        "src": src,
    }


def check(plan_path, article_path, lo_override=None, hi_override=None):
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    plan["_path"] = str(plan_path)
    raw = Path(article_path).read_text(encoding="utf-8")
    body = norm(raw)
    fails, warns = [], []

    figs = plan.get("figures", [])
    cp = plan.get("count_policy") or {}
    policy = cp.get("mode", "structure")
    has_blocks = bool(plan.get("blocks") or plan.get("blocks_file"))
    cov = check_coverage(plan, raw, fails, warns)
    if not figs:
        fails.append("figures 为空：至少要有 1 张，否则调用方拿不到任何图")
    else:
        check_structure(plan, figs, fails, warns, policy, has_blocks=has_blocks)
    if figs and policy == "length":
        density = cp.get("density") or (300, 600)
        lo, hi = count_band(len(body), policy, cp.get("value"), lo_override, hi_override, density)
        explained = cp.get("note") or cp.get("_note")
        if not (lo <= len(figs) <= hi) and not explained:
            warns.append(
                f"图数量 {len(figs)}，按本文 {len(body)} 字、密度 {density[0]}–{density[1]} 字/张"
                f"推的区间是 {lo}–{hi}；若这是有意的，在 plan 里写 count_policy 说明"
            )
    elif policy == "fixed":
        want = int(cp.get("value") or 0)
        if want and len(figs) != want:
            fails.append(f"count_policy=fixed {want} 张，实际 {len(figs)} 张")
    elif policy == "split":
        batches = cp.get("batches") or []
        if not batches:
            warns.append("count_policy=split 但没写 batches：分卷要说明每卷几张、各讲哪一段")
        else:
            total = sum(int(b.get("figures", 0)) for b in batches)
            if total != len(figs):
                fails.append(f"batches 图数之和 {total} ≠ figures 实际 {len(figs)}：分卷账对不上")
    if not plan.get("dropped"):
        warns.append("dropped 为空：没有做删减，说明规划没有过筛")

    seen_types = {}
    for f in figs:
        t = f.get("figure_type")
        seen_types.setdefault(t, []).append(f)

    for f in figs:
        tag = f.get("id", "?")
        if not find(f.get("anchor_quote", ""), body):
            fails.append(f"{tag}: anchor_quote 在原文里查不到 —— 可能是编的")
        if f.get("figure_type") not in TYPES:
            fails.append(f"{tag}: 未知图型 {f.get('figure_type')}")
        b = f.get("budget", {})
        if b.get("nodes", 0) > 9:
            fails.append(f"{tag}: 节点 {b.get('nodes')} > 9，应拆图")
        if b.get("arrows", 0) > 12:
            fails.append(f"{tag}: 箭头 {b.get('arrows')} > 12")
        if b.get("accents", 0) > 2:
            fails.append(f"{tag}: 焦点色 {b.get('accents')} > 2")
        if not f.get("why_not_table"):
            warns.append(f"{tag}: 没写「为什么不是表格」")
        flags = " ".join(f.get("honesty_flags", []))
        for item in f.get("data", []):
            for n in numbers_in(item.get("value", "")):
                if n in raw:
                    continue
                if n.startswith("0") and len(n) == 2:
                    continue  # 01 / 03 是序号，不是数值
                if any(w in flags for w in HONESTY_WORDS):
                    continue
                fails.append(f"{tag}: 数字 {n} 原文没有，也没在 honesty_flags 里承认")
        claim = f.get("claim", "")
        if "以及" in claim or "和" in claim.replace("和值", ""):
            warns.append(f"{tag}: claim 里出现并列连词，检查是不是塞了两个判断")

    for t, group in seen_types.items():
        if len(group) < 2:
            continue
        names = " / ".join(g.get("id", "?") for g in group)
        variants = [g.get("variant", "").strip() for g in group]
        if not all(variants):
            fails.append(f"同一篇出现 {len(group)} 张 {t}（{names}）：每张都要写 variant，否则会出两张一样的图")
        elif len(set(variants)) != len(variants):
            fails.append(f"{t} 复用了同一个 variant：{variants} —— 同型不同图，形状必须真的不一样")
    return fails, warns, cov


def _args(argv):
    """positional: plan, article ; optional: --min N --max N"""
    pos, lo, hi = [], None, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--min", "--max") and i + 1 < len(argv):
            v = int(argv[i + 1])
            if a == "--min":
                lo = v
            else:
                hi = v
            i += 2
            continue
        if a.startswith("--min=") or a.startswith("--max="):
            k, v = a.split("=", 1)
            if k == "--min":
                lo = int(v)
            else:
                hi = int(v)
            i += 1
            continue
        pos.append(a)
        i += 1
    return pos, lo, hi


def main():
    argv = sys.argv[1:]
    pos, lo, hi = _args(argv)
    if len(pos) != 2:
        print(__doc__)
        return 2
    fails, warns, cov = check(pos[0], pos[1], lo, hi)
    if cov:
        print(
            f"COVER  blocks {cov['blocks']}  ·  可画 {cov['drawable']}  ·  接住 {cov['covered']}  ·  "
            f"漏 {cov['gap']}  ·  不画已交代 {cov['notes']}  ·  页 {cov['pages']}  ·  "
            f"按每页 {BLOCK_CAP} 块的下限 {cov['min_pages']} 页  ·  断言组 {cov['groups']}"
        )
        print()
    for w in warns:
        print("WARN  " + w)
    for f in fails:
        print("FAIL  " + f)
    print(f"\n{len(fails)} fail, {len(warns)} warn")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
