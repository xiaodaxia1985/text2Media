"""把「帧目录 + 配音对齐」拼成渲染引擎要的 script.json。

这一步以前是手工的：帧出来了，script.json 还得照着 alignment 抄一遍时长、抄一遍
路径，抄错一个就白渲一次。这里把它固化成一步，而且以**配音的对齐结果为准**——
音频是既成事实，时长从 `alignment.json` 来，不从估算来。

    python build_script.py <帧目录> <alignment.json> <out.script.json> \
        [--slug huang-figures-layouts] [--title "标题"] [--credit 个人商业实战] \
        [--source-url URL] [--source-author 今日头条] \
        [--media-prefix assets/media/huang-lib/] [--bg "#101317"] [--accent "#BF4520"] \
        [--voice news-man] [--motion-by-layout]

一镜两帧：帧目录里有 `<页名>b.png` 时，这一镜拆两拍（全景 + 推近），时长对半分，
音频仍是同一段，不重配。

判错（有一条就退出非零）：
  · 帧数与配音的镜数不一致 —— 说明少渲了页或者少了一句词
  · 任一镜时长 < 1.2s —— 字幕来不及读
  · 帧文件缺失 / 不是 16:9 或 9:16
"""
import json
import sys
from pathlib import Path

from PIL import Image

# 版式 → 运镜：重手法给推近，竖排给缓慢漂移，横排给平移，避免十镜全是 kenburns
MOTION_BY_LAYOUT = {
    "A": "pan-left", "B": "pan-right", "C": "kenburns", "D": "kenburns",
    "E": "drift", "F": "drift", "G": "push-in", "H": "push-in",
    "I": "push-out", "J": "pan-left", "K": "drift", "L": "push-in",
}
MIN_DUR = 1.2


def parse(argv):
    pos, opt = [], {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                opt[a[2:]] = argv[i + 1]
                i += 2
            else:
                opt[a[2:]] = True
                i += 1
        else:
            pos.append(a); i += 1
    return pos, opt


def main(argv):
    pos, opt = parse(argv)
    if len(pos) != 3:
        print(__doc__)
        return 2
    frames_dir, align_path, out_path = Path(pos[0]), Path(pos[1]), Path(pos[2])
    media_prefix = opt.get("media-prefix") or "assets/media/cards/"

    align = json.loads(align_path.read_text(encoding="utf-8"))
    scenes = align.get("scenes") or []
    if not scenes:
        print("FAIL  alignment.json 里没有 scenes：先跑配音")
        return 1

    all_png = sorted(frames_dir.glob("*.png"))
    base = [p for p in all_png if not p.stem.endswith("b")]
    zooms = {p.stem[:-1]: p for p in all_png if p.stem.endswith("b")}
    fails = []

    if len(base) != len(scenes):
        fails.append(f"帧 {len(base)} 张 vs 配音 {len(scenes)} 镜：对不上")

    shotplan = None
    sp_path = frames_dir / "shotplan.json"
    if sp_path.exists():
        shotplan = json.loads(sp_path.read_text(encoding="utf-8"))

    layouts = []
    if shotplan:
        layouts = [s.get("layout") for s in shotplan.get("shots") or []]

    size = None
    scenes_out = []
    for i, sc in enumerate(scenes):
        if i >= len(base):
            break
        p = base[i]
        if size is None:
            size = Image.open(p).size
        dur = float(sc["end"]) - float(sc["start"])
        text = "".join(l.get("text", "") for l in sc.get("lines") or [])
        shots = []
        parts = [(p, "push-in"), (zooms.get(p.stem), "kenburns")] if zooms.get(p.stem) else [(p, None)]
        each = dur / len(parts)
        for j, (fp, motion) in enumerate(parts):
            if each < MIN_DUR:
                fails.append(f"{sc['id']} 拆两拍后每拍 {each:.2f}s < {MIN_DUR}s：字幕来不及读")
            name = layouts[i] if i < len(layouts) else ""
            mv = motion or MOTION_BY_LAYOUT.get(name, "kenburns")
            shots.append({
                "id": f"{sc['id']}-s{j + 1}",
                "dur": round(each, 2),
                "motion": mv,
                "material": {"kind": "card", "src": f"{media_prefix}{fp.name}"},
            })
        scenes_out.append({"id": sc["id"], "lines": [text] if text else [""], "shots": shots})

    if size and not any(abs(size[0] / size[1] - r) < 0.02 for r in (16 / 9, 9 / 16)):
        fails.append(f"帧尺寸 {size[0]}×{size[1]} 不是 16:9 或 9:16：画幅跟素材比例，别硬塞")

    script = {
        "version": 2,
        "format": "cards",
        "slug": opt.get("slug") or out_path.stem.replace(".video.script", ""),
        "title": opt.get("title") or "图解短片",
        "credit": opt.get("credit") or "个人商业实战",
        "source": {"author": opt.get("source-author") or "", "url": opt.get("source-url") or ""},
        "theme": {"name": "paper", "bg": opt.get("bg") or "#101317",
                  "accent": opt.get("accent") or "#BF4520", "accent2": "#2D3142"},
        "voice": {"id": opt.get("voice") or "news-man", "backend": opt.get("voxcpm") or "voxcpm"},
        "size": {"w": size[0], "h": size[1]} if size else {"w": 1920, "h": 1080},
        "scenes": scenes_out,
    }
    out_path.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(s["dur"] for sc in scenes_out for s in sc["shots"])
    shots_n = sum(len(sc["shots"]) for sc in scenes_out)
    for f in fails:
        print("FAIL  " + f)
    print(f"SCRIPT {len(scenes_out)} 段 · {shots_n} 刀 · {total:.1f}s · {size[0]}×{size[1] if size else 1080}")
    print(f"wrote {out_path}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
