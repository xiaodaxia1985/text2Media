---
name: image-cards
description: 卡片：固定比例的图文卡片组——小红书 3:4（1080×1440）、Instagram 4:5、方图 1:1、竖屏 9:16，附总览图和发帖文案。两种输入：改写稿 content.json → 总结卡片（封面 + 每节一卡 + 清单 + 要点总结，7 套主题）；文章 article.md（原文、译文、逐字稿）→ 原文卡片（整篇按顺序分页成卡片，一字不改，逐块校验）。可以单独用，也可以接在抓取、改写、翻译后面。Use when the user wants 小红书图文, 轮播卡片, 知识卡片, 3:4 / 4:5 / 1:1 / 9:16 cards, Instagram carousel, 朋友圈方图, or 原文卡片 / 全文卡片 / 把全文做成小红书 — from an article or an existing content.json.
argument-hint: <content.json|article.md|目录> [--ratio 3:4|4:5|1:1|9:16 或 小红书/IG] [--theme 主题名|a,b|all] [--out 目录]
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
version: "2.0.1"
---

# 卡片（image-cards）

| 输入 | 产出 |
|---|---|
| `content.json`（改写稿） | 总结卡片：`<目录>/<主题>-3x4/card-01.png …`、`overview.jpg`、`caption.md` |
| `article.md`（原文、译文、逐字稿、`rewrite.md`） | 原文卡片：`<目录>/full-3x4/card-01.png …`、`overview.jpg`、`caption.md` |

参数：`$ARGUMENTS`

**比例怎么定**：说平台名就够了，不要自己记比例——`--platform 小红书|抖音|微信|X` 由引擎查表（下面「平台」一节），比例、张数上限、目录命名一次定好。只有用户明确要某个比例、又不属于这四个平台时，才用 `--ratio 3:4|4:5|1:1|9:16`。

## 平台（`--platform`）：比例、张数、目录名都交给引擎

| 平台 | 展示画框 | 比例 | 单篇上限 | 说明 |
|---|---|---|---|---|
| 小红书 | 1080×1440 | 3:4 | 18 | 图文笔记 |
| 抖音 | 1080×1440 | 3:4 | 30 | **图文按 3:4**；交 9:16 会被套进 3:4 框左右裁边 |
| 微信 | 1080×1440 | 3:4 | 9 | 公众号正文配图 / 朋友圈；长文排版用 `wechat-layout` |
| X | 1200×1500 | 4:5 | 4 | 信息流竖图 |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/content.json --platform 小红书 --theme apple-flow
```

- 产物目录固定为 `<目录>/<主题>-<平台>-<比例>/`（如 `hark-noir-抖音-3x4/`），交付时按平台分别说明，不要混在一堆里。
- `--platform` 与 `--ratio` 冲突会**直接报错**（抖音配 9:16 这种），不会悄悄按错比例出图。
- **画框预演（必看）**：带 `--platform` 出图后会多一张 `frame-check.png`——每张卡放进平台真实画框，虚线是曲面屏不遮挡的安全区，黑蒙版是平台会裁掉的部分。卡上标「完整」才算过；标「被裁 Npx」或报「正文离画框边缘只剩 Npx」必须回改（换比例，或把边距放宽），别在真机上才发现。
- 张数超过平台上限会报 ✗：减卡（`card.mode="skip"`）或拆成多条发布。


## 0. 先确定输入
- 已有 `content.json` → 总结卡片；用户只给了文章、又说"原文 / 全文 / 一字不改" → 原文卡片。
- 给的是链接、文件、粘贴的正文或视频 → 先用 `article-fetch` / `video-transcript` 取原文。
- 只有文章、用户没说原文还是总结 → 卡片默认**改写**：先用 `article-rewrite` 写 content.json（卡片专用字段按 `references/xhs-guide.md` 写）。原文是外文、又要原文卡片 → 先用 `article-translate`。
- 判断规则、工作目录和调用其他能力的方式：`../article2media/references/pipeline.md`。

第一次使用先跑 `node ${CLAUDE_SKILL_DIR}/scripts/doctor.mjs`（Node 22+、Chrome）。

## 1. 总结卡片（content.json）
读 `references/xhs-guide.md`：封面、每张卡只讲一件事、发帖文案（`cover`、`xhs`、`card` 字段）。

**先出版式方案，确认后再出图**（一组卡片最容易犯的错是每篇都排成同一个样子）：
```bash
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/content.json --ratio 3:4 --plan   # 只出版式方案，不渲染
```
`--plan` 写 `<目录>/plan-3x4/` 下的 `plan.html`、`plan.png`（灰模拼图）、`plan.json`，逐张列出卡型（封面 / 章节页 / 主张 / 对比 / 时间线 / 数据 / 图证 / 过程 / 证据 / 清单 / 收尾）、信息量、有没有图，**并在出图前就把每张卡量一遍**：把成图那份真卡 HTML 跑进浏览器，量出内容覆盖率与最大空带（`覆盖 84% 空 8%` 这一列，同时写进 plan.json 与灰模每张卡的说明行）；空带超限的卡在灰模上描红，并合成第 9 条闸门「逐卡实测」。**灰模说哪张空，就是哪张空**，不用等出完九张图再肉眼找。它同时检查八条硬约束：
- 整组至少 3 种卡型；
- 相邻两张卡不同型（同一节拆成的续卡不算）；
- 图卡不超过 40%；
- 每 4 张内容卡至少 1 张"轻卡"（主张 / 章节页）；
- 内容卡不超过 12 张（3:4）；
- **没有"内容太薄"的卡**（非主张/章节页的卡少于 45 字就报 ✗）：一张卡读起来空、头重脚轻，是内容量的问题，不是间距问题——把相邻薄节并成一张，或补一句说明。**并卡的前提是同一主题**，两个议题不能挤进一张卡。这个 45 字的口径与渲染期的覆盖率闸门（<78% 提示）对齐，灰模说通过、出图又说空的情况不会再出现。
- **写了 role 但证据撑不起来**会报 ✗：比如标了 `compare` 却没写 `compare.left/right`。引擎会把它降级成常规卡，灰模直接点名是哪一张。
- **超出容量上限**会报 ✗：主张 >30 字、对比 >4 行、时间线 >6 节点、数字 >3 个、章节标题 >12 字。排得下也算挤，拆卡或删内容。

✗ 的项会打印出来。**卡型不对就先改 content.json 再重出方案**：给这一节加 `"role"`（没写时引擎按标题和数字猜），五种 role 会真正换掉整张卡的版式：

| role | 卡片 | 要写的字段 | 上限 |
|---|---|---|---|
| `claim` | 一句大主张占满卡 | `claim.text` / `claim.note` | 主张 ≤ 25 字、补充 ≤ 40 字 |
| `compare` | 左右两栏 | `compare.left / right`（title + items） | 每栏 2–4 条，每条 ≤ 14 字 |
| `timeline` | 一串节点，只靠细分割线分隔，不写序号也不放圆点 | `timeline`：`{at, title, note}`（`at` 只写真实时间，别写 01、02） | 3–6 个节点 |
| `stat` | 1–3 个大数字 | `stats`：`{value, unit?, label, note?}` | ≤ 3 个 |
| `opener` | 章节页（幕标 + 标题 + 短线 + 一句导语，居中，不放节序号） | `heading` + 第一段 | 标题 ≤ 10 字 |
| `fig` | 图卡证据：图占卡高 45–65%，说明压在下方，有数字就排一行 | `figures` + `card.text`（≤40 字）+ 可选 `stats`（≤3） | 说明 ≤ 40 字 |

界格 `grid` 已于 2026-11-11 下线（一列一个字在手机上读起来像空表格），写了会直接报错。

其余 role（`process` / `evidence` / `quote` / `structure` / `checklist`）照常渲染常规卡、图卡或清单，只在方案里参与节奏统计。**role 写了但没写对应字段**不会报错，会退化成常规卡并给一条提示。不想要图就写 `"card": { "figure": "none" }`。方案通过、用户确认后，再执行下面的出图命令。

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/content.json --ratio 3:4 --check   # 只校验：会出几张
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/content.json --ratio 3:4           # 出图，一组大约 5 秒
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/content.json --ratio 3:4 --theme signal-swiss
```
- 主题：content.json 的 `theme`（可写成 `{"long": …, "cards": …}` 分开指定）；都没有时按 `../article2media/references/styles.md` 选。卡片场景的主题调整见 styles.md 第 3 步。
- **排版量纲是写死的**（`engine/scripts/lib/metrics.mjs`）：卡片四边留白 72 / 80 输出像素（CSS 40 / 36）；大标题按去标点字数走五档 132 / 108 / 96 / 84 / 72（6 字以内 / 7–10 字 / 两行且每行 ≤8 字 / 两行 / 三行）；节标题收在 48–76。改字号时改这个模块，不要在各处手写 px。
- **大标题不带逗号句号**：封面标题、节标题、主张大字里的 ``，`` ``。`` ``、`` 只当断行用——写了也一样会被断成多行并把符号删掉（「能出图，不等于好看的图。」→ 三行）。断行位置要自己想清楚，别指望标点替你分段。
- **中文断行自己写 `\n`**：引擎只按字形宽度断，会把词切开（"做得好的产／品"、"任／何多余"）。封面标题、章节页导语、主张大字里凡是希望断得干净的地方，都在 content 里写 `\n`；写了就按写的断，不会再自作主张。
- **章节页标题 80 输出（CSS 40）、导语 33 / 宽 64%**：章节页只有一两句话，标题不够大整页就发空。两个数在 `card.css` 的 `.c-open-h` / `.c-open-lead`。
- **块状卡（对比 / 时间线）不拉满整页**：标题 → 导语 → 表 → 结论连着排，空白留在末尾（末尾空会被量出来），不在标题和表格之间凿洞；时间线节点宽度收到 86%，不横铺满卡宽。为了填满卡片把每行拉到 90–110px，就是「块与块之间太松、整卡又显铺满」。
- **装不下时按四档阶梯走**：≤40px 整块上移；40–90px 压块间距；90–160px 收标题字号；160px 以上才自动省略可选内容。用了哪一档会写进版面检查（"靠压间距才装下""靠收字号才装下"），看到这类提示说明这页内容已经在上限，别再往里塞。
- **检查（最多 2 轮）**：先看 `overview.jpg`，有问题再打开单张卡。✗ 必须修；报「居中的说明段落排成了长排」（最宽一行占卡宽 ≥86%）说明说明段横铺了整卡，居中已经失效——收窄容器宽度或在内容里手动断行；报「内容只占卡高 X%」「上段/中段/下段有 Npx 连续空白」「底部空 Npx」「内容整体偏上/偏下」时，是引擎按内容块坐标量出来的空洞或偏心，处理办法只有两条：回 content.json 补证据（优先），或换更贴内容的卡型；**不要靠加空行、拉行高、加装饰把它盖住**。报「内容超出」「已自动省略」「图只放大到 x 倍」时，按 xhs-guide.md 第 2 节的顺序处理（缩短 `card.text`、改 `split`、`skip` 次要的节）。只改 content.json 再重渲，不手改 HTML。

## 2. 原文卡片（article.md）
读 `references/original-cards.md` 和 `../article2media/references/verbatim.md`。
```bash
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/article.md --ratio 3:4
node ${CLAUDE_SKILL_DIR}/scripts/cards.mjs <目录>/article.md --ratio 3:4 --theme paper-editorial   # 用主题的颜色与字体
```
全文校验未通过就是错误，不能靠目测放行。看 `overview.jpg` 检查断开的位置；张数超过上限时按 original-cards.md 处理，不删原文。

## 3. 交付
- 卡片目录、张数、每张的尺寸；`overview.jpg` 路径；
- 把 `caption.md` 里的标题、正文和标签**直接贴在回复里**，方便复制（原文卡片要你补标签、必要时缩短标题）；
- 总结卡片：用的主题和理由；换主题 `--theme 名称`、换比例 `--ratio 4:5` 都不用重写内容；
- 原文卡片：原文块数与全文校验结果、生成图 0 张；
- 需要用户留意的地方。
