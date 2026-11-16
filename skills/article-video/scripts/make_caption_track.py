"""配音对齐 JSON → 每镜一组 Remotion Caption[]（生成 TS 文件）。

    python make_caption_track.py <alignment.json> --frames "148,214,..." \
        --out <captions-data.ts> [--fps 30] [--shots "V01,V02,..."]

为什么按镜切、不合成一条全片字幕：

    `remotion-captions/display-captions.md` 明确要求「每镜一组字幕、内联在该镜的
    Sequence 里，不要把多镜字幕合成一个覆盖全片的浮层」——浮层在挪镜、裁剪、
    变速时字幕不跟着走。所以这里输出 {镜 ID: Caption[]}，时间相对该镜起点。

分句递进怎么来的：

    不用把 `combineTokensWithinMilliseconds` 调小去凑「一页几个字」（那是按固定
    毫秒切，句中断开很正常）。alignment 的 chars 是逐字时间戳，逗号句号也在里面，
    所以在标点那一枚 token 上打 `pageBreakAfter: true`（官方 Caption 的字段），
    页就严格按分句断——念完一个逗号才换页。配合一个很大的
    `combineTokensWithinMilliseconds`，整条只有分句边界会断页。

时间口径（唯一一条，别改）：

    alignment.json 的时间基点是配音 wav 的 0 点；镜 i 在 wav 里的起点 =
    sum(前 i-1 镜帧数)/fps 秒。所以

        relMs = (charStart 秒 - 镜起点秒) * 1000

    负数钳 0，零时长 token 给 min-ms 兜底。注意别用 scene.start 当镜起点——各镜
    开头有 0.01~0.05s 的空气，用 scene.start 会让字幕整体晚于画面。

    （scene.start 与镜起点之差在 16 镜实测是 0.013~0.044s，都不足 1.5 帧；
    但这条口径是「画面帧对齐」而不是「句子对齐」，两者不要混。）
"""
import argparse
import json
import sys
from pathlib import Path

# 断页标点：念到这些符号，当前页结束
PUNCT_END = "，。？！；：、…"


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def parse_list(s: str):
    return [x for x in s.replace(" ", "").split(",") if x]


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("alignment", help="alignment.json 路径")
    ap.add_argument("--frames", required=True, help="每镜帧数，逗号分隔")
    ap.add_argument("--shots", default="", help="镜 ID，逗号分隔；默认 V01..Vnn")
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--out", required=True, help="输出 .ts 路径")
    ap.add_argument("--min-ms", type=int, default=1, help="零时长 token 的兜底")
    a = ap.parse_args(argv)

    al = json.loads(Path(a.alignment).read_text(encoding="utf-8"))
    frames = [int(x) for x in parse_list(a.frames)]
    scenes = al["scenes"]

    if not (len(frames) == len(scenes)):
        print(f"FAIL 帧数表 {len(frames)} 段 vs alignment scene {len(scenes)} 段，对不上", file=sys.stderr)
        return 2

    ids = parse_list(a.shots) or [f"V{i:02d}" for i in range(1, len(frames) + 1)]
    if len(ids) != len(frames):
        print(f"FAIL 镜 ID {len(ids)} 个 vs 帧数表 {len(frames)} 段，对不上", file=sys.stderr)
        return 2

    warn = []
    tracks = {}
    prefix = 0.0  # 该镜在 wav 上的起点（秒）

    for sid, sc, fr in zip(ids, scenes, frames):
        toks = []
        for li, line in enumerate(sc["lines"], 1):
            text = line["text"]
            chars = line["chars"]
            if len(text) != len(chars):
                n = min(len(text), len(chars))
                warn.append(f"{sid} 第 {li} 行：text {len(text)} 字 vs chars {len(chars)} 段，按前 {n} 字对齐")
            else:
                n = len(chars)
            for i in range(n):
                ch = text[i]
                st, en = chars[i][0], chars[i][1]
                rel_s = max(0.0, (st - prefix) * 1000)
                rel_e = max(0.0, (en - prefix) * 1000)
                if rel_e <= rel_s:
                    rel_e = rel_s + a.min_ms
                toks.append(
                    {
                        "text": ch,
                        "startMs": round(rel_s),
                        "endMs": round(rel_e),
                        "pageBreakAfter": ch in PUNCT_END,
                    }
                )
        tracks[sid] = toks
        prefix += fr / a.fps

    total_tok = sum(len(v) for v in tracks.values())
    total_page = sum(1 for v in tracks.values() for t in v if t["pageBreakAfter"]) + len(tracks)

    out_lines = [
        "// 自动生成，勿手改。",
        f"// 生成器：text2Media\\skills\\article-video\\scripts\\make_caption_track.py",
        f"// 来源：{Path(a.alignment).name} · fps={a.fps:g} · {len(frames)} 镜 · {total_tok} token · 约 {total_page} 页",
        "// 分句断页靠 token 上的 pageBreakAfter（标点处），不是靠固定毫秒窗口。",
        "import type {Caption} from '@remotion/captions';",
        "",
        "export const CAPTIONS: Record<string, Caption[]> = {",
    ]
    for sid in ids:
        out_lines.append(f"\t{sid}: [")
        for t in tracks[sid]:
            pb = ", pageBreakAfter: true" if t["pageBreakAfter"] else ""
            out_lines.append(
                f"\t\t{{text: '{esc(t['text'])}', startMs: {t['startMs']}, endMs: {t['endMs']}, "
                f"timestampMs: {t['startMs']}, confidence: null{pb}}},"
            )
        out_lines.append("\t],")
    out_lines.append("};")
    out_lines.append("")

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text("\n".join(out_lines), encoding="utf-8")

    for w in warn:
        print("WARN  " + w, file=sys.stderr)
    print(f"OK  {len(ids)} 镜 · {total_tok} token · 约 {total_page} 页 → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
