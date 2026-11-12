# content.json 交付说明（给外部写作模型）

> 你只负责产出 `content.json`。渲染、校验、三平台发布由接手方跑。
> 仓库里已有官方 schema，本文是"最短上手 + 必须遵守的硬约束"，不重复它。

## 0. 先读这三份（按顺序，别跳）

| 文件 | 讲什么 |
|---|---|
| `skills/article-rewrite/references/content-schema.md` | 顶层 / Page / Section / role 的全部字段与字数上限 |
| `skills/article-rewrite/references/figures.md` | 图表类型（bar / hbar / stack / flow / grid / converge / tree / stats / equation / path / compare / cycle / quote / svg / image）与各自字段 |
| `skills/image-cards/references/xhs-guide.md` | 卡片专用三件套：`cover` / `card` / `xhs` 怎么写 |

写完必须跑第 4 节的自检，不跑等于没交。

## 1. 交付什么

- 一个文件：`<工作目录>/content.json`。**一篇文只交一份**，小红书、抖音、公众号都从这一份渲。
- 文件里**只放内容**：不要写颜色、字体、宽高、比例、平台名、张数——那些由渲染参数决定。
- 允许写 `theme`（主题名，或 `{"long":"…","cards":"…","wechat":"…"}` 分开指定）；不写也行，渲染端会按 `styles.md` 选。
- 不要动仓库里任何其它文件。

## 2. 最小骨架（这个结构能直接跑通）

```jsonc
{
  "lang": "zh",
  "title": "两行大标题\n每行不超过十二个汉字",
  "series": "栏目名（可选）",
  "source": {
    "author": "原作者", "handle": "@handle",
    "title": "原文标题", "platform": "X 文章",
    "date": "2026-11-03", "url": "https://…"
  },
  "cover": {
    "title": "一个人\n就是一支\n**创意团队**",
    "kicker": "长文拆解 · 15 张图",
    "subtitle": "说清这组图能给你什么，≤60 字",
    "points": ["第一条收获", "第二条收获", "第三条收获"],
    "cta": "收藏这组图，开始搭你的内容系统"
  },
  "xhs": {
    "title": "≤20 个字符的标题",
    "caption": "第一句是钩子……300–600 字，末尾引导互动",
    "tags": ["大类", "具体主题", "人群", "作者名"]
  },
  "pages": [
    {
      "part": "第一部分 · 小标题",
      "intro": "2–3 句导语，≤120 字",
      "sections": [
        {
          "label": "节标签",
          "heading": "这一节讲什么\n可手动断行",
          "paragraphs": ["1–3 段，每段 ≤90 字"],
          "bullets": ["0–3 条，每条 ≤30 字"],
          "takeaway": "一句结论，≤26 字",
          "card": { "text": "卡片正文 ≤90 字", "bullets": ["≤3 条，每条 ≤26 字"], "figure": "none" },
          "figures": [ { "type": "bar", "caption": "图注", "data": [["2024", 29.5, "$29.5B"]] } ]
        }
      ],
      "closing": "收束句 + 下页预告，≤60 字"
    }
  ]
}
```

必填：`lang`、`title`、`pages`（1–4 页，每页 3–4 节）。
强烈建议：`source`（页脚来源行）、`cover`（没有就退化用 title + intro，封面会很难看）、`xhs`（没有就没有发帖文案）。

## 3. 硬约束（违反会被 `--plan` / `--check` 拦下来）

**字数按视觉宽度算**：一个汉字或全角标点 = 1，一个字母/数字/半角符号 = 0.5。

| 对象 | 上限 |
|---|---|
| `title` | 2 行，每行 ≤12 汉字 |
| `heading` | ≤16 字；`role: opener` 时 ≤10 字 |
| `paragraph` | 每段 ≤90 字 |
| `bullets` | ≤30 字/条，≤3 条 |
| `takeaway` | ≤26 字 |
| `intro` | ≤120 字；`closing` ≤60 字 |
| `cover.title` | 2–3 行，每行 ≤10 字，1 处 `**关键词**` |
| `cover.subtitle` | ≤60 字；`cover.points` 3–5 条，≤16 字 |
| `card.text` | ≤90 字（`role: fig` 时 ≤40 字） |
| `xhs.title` | ≤20 个字符（字母空格都算 1） |
| `xhs.caption` | ≤1000 字，建议 300–600 |
| `xhs.tags` | 5–8 个，不写 `#` |

**排版类**

- 大标题里**不要写** `，` `。` `、`——引擎会当断行用并把符号删掉。要断行就自己写 `\n`。
- 中文断行必须自己写 `\n`：引擎按字宽断，会把词切开（"产 / 品"）。
- 行内只支持 `**加粗**` 和 `\n`；其它 Markdown、HTML 会按原文转义显示。

**卡片节奏（`--plan` 会逐条查）**

- 整组至少 3 种卡型；相邻两张不能同型（同一节拆的续卡除外）；
- 图卡 ≤40%；每 4 张内容卡至少 1 张"轻卡"（`claim` / `opener`）；
- 内容卡 ≤12 张（3:4）；非主张/章节页的卡少于 **45 字** 会报 ✗（内容太薄）；
- 单卡容量：主张 ≤25 字、对比每栏 2–4 条 ≤14 字、时间线 3–6 节点、数字 ≤3 个。

**role 写了就要给对应字段**，否则退化成常规卡并在灰模上点名：

| role | 必给字段 |
|---|---|
| `claim` | `claim.text`（≤25 字）、`claim.note`（≤40 字） |
| `compare` | `compare.left` / `compare.right`，各含 `title` + `items` |
| `timeline` | `timeline: [{at?, title, note}]`，`at` 只写真实时间，不写 01/02 |
| `stat` | `stats: [{value, unit?, label, note?}]`，≤3 个 |
| `opener` | `heading` + 第一段（导语） |
| `fig` | `figures` + `card.text`，可选 `stats` |

**界格 `grid` 已于 2026-11-11 下线**，写了会直接报错。并列的短词改写成 `claim`，或并进相邻卡。

**平台张数上限**（以 `skills/article2media/engine/scripts/lib/platforms.mjs` 为准）：

| 平台 | 比例 | 单篇上限 |
|---|---|---|
| 小红书 | 3:4（1080×1440） | 18 |
| 抖音 | 3:4（1080×1440） | **30** |
| 微信 | 3:4 | 9 |
| X | 4:5 | 4 |

> `skills/image-cards/SKILL.md` 的表格里还写着抖音 12，那是改版前的旧值，已被 `platforms.mjs` 覆盖；以代码为准。

## 4. 自检（交付前必跑，不出图）

```bash
# 只校验结构，快
node skills/article-rewrite/scripts/check.mjs <工作目录>/content.json

# 出版式方案 + 灰模：把空卡、薄卡、卡型重复、超上限、内容覆盖不足全部点出来
node skills/article2media/engine/scripts/render.mjs <工作目录>/content.json --platform 小红书 --plan
```

`--plan` 会写 `plan.json` / `plan.png`，逐张列卡型、信息量、覆盖率与最大空带；灰模上描红的卡必须回改。

## 5. 内容口径（工具查不出来，但你得守）

- 只用原文有的事实、数字、专名。原文没有的不补、不推测；拿不准就不写。
- 不夸大：不写"月入十万""保姆级""全网最全""错过再等一年"。
- 每节只讲一件事；`takeaway` 是结论，不是把正文再复述一遍。
- 图片里不放 emoji；`caption` 里可少量分段。
- 引用别人的观点要标作者与标题，别写成自己的。
- 卡片是"手机一屏"，宁可少一条，不要塞满。

## 6. 改稿时（增量，不是重写）

- 只改被改动的节，其余节**逐字保持原样**——整组重渲后前后不一致，比错字更糟。
- 字段有增删时同步检查 `cover.points` 和末张 takeaway 列表是否还对得上。
- 改完照样跑第 4 节自检。

## 7. 交付时回报这几项

- 页数、节数、总字数；
- 用了哪些 role，预计出几张卡（贴 `--check` 的输出）；
- 哪些数字/专名你没把握（接手方会去核对）。

---

跑完渲染后产物（`card-*.png`、`overview.jpg`、`caption.md`、公众号 `wechat.md`）由接手方负责生成和送达，不在你的交付范围内。
