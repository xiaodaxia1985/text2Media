---
name: article-figures
description: 把一篇中文文章拆成若干张自包含的图解页（HTML → PNG），每张证明一个论断；图数由图能证明的论断数决定，不预设上限，长文可分卷；字体、字号、纸色走可被覆盖的 style.json，不写死；画幅两套页壳——16:9 横页与 3:4 竖版（小红书/抖音，含配套封面）。当用户要求「给这篇文章配图」「做几张图解」「把这篇文章做成信息图/卡片页」「文章配图要能直接发」「这篇要 20 张图」「适配抖音和小红书」时使用。不用于纯图片生成、视频成片。
metadata:
  short-description: 文章 → 论断 → 图解页（数量随文章走）
---

# Article Figures

读者记住的不是十几段字，是**几张各说一件事的图**。这个 skill 干一件事：把文章读成若干「论断」，每个论断配一张图，图要证明它、不许美化它。

**几件事都不写死**：图数、画幅、字体族、字号、纸色、accent——默认值只是这篇的起点，任何一项都能被 plan 或 `style.json` 覆盖。七张是这篇文章的结论，不是规范。

## 什么时候用，什么时候别用

**用**：文章有数据、有立场、有可被证明的论断；要做小红书/抖音图卡、公众号配图、网页正文插图、一稿多图。

**别用**：

- 只要一张封面 → `image-cards` 或设计类 skill。
- 要视频 → 出完这套页再交 `card-video`（本 skill 只出静态页，不合成片）。
- 内容本身是并列清单 → 直接写表格。
- 只有一个数字 → 写一句话，别画。

## 图数：由文章结构决定，不由字数决定

**字数推张数是错的**：AI 读完全文的意义就是知道这篇文章到底分成几块、哪块有证据，而不是数它有多少字。所以张数从 `article_map` 这张表里长出来，不是从字数里除出来。

| 步骤 | 做法 |
|---|---|
| 1. 按原文的节切开 | 用文章自己的标题切（一级/二级标题），一节一行。作者写了几节，表就有几行——不是我们替它分。 |
| 2. 每节写清三件事 | `claim`（这节的可反驳结论）／`figures`（落到哪几张图，id 列表）／不画就写 `reason`。 |
| 3. 张数 = 表的结果 | 有证据、表格替代不了的节才配图；一节最多两张（超过就是该拆节）。九问这类清单写进 `reason`，不画。 |
| 4. 只留两条上限 | 单套超过 **12 张**就分卷（`count_policy.mode="split"`）；平台舒适区在小红书/抖音是 12–14 张一组、公众号/网页插到正文即可。上限是排版约束，不是张数来源。 |

`plan_check.py` 会验这张表：每张图必须能在表里找到归属、表里引用的图必须存在、两边张数必须相等、没配图的节必须写了理由。表不成立 → FAIL，因为那说明张数不是读出来的。

`count_policy.mode`：`structure`（默认，按上面的表）／`fixed`（客户点名要 N 张）／`split`（分卷，各卷张数之和必须等于实际张数）／`length`（仅作历史兼容的旧算法，字数÷密度）。

## 覆盖校验：节级表不够，要块级表（2026-11-16）

**节级表能回答「这节画不画」，回答不了「这节里哪句话该独占一页」。** 实测：一篇 4750 字的文拆成 8 节，出了 6 张图，看着「每张都有归属、0 fail」，实际只接住了 53 个语义块里的 26 个——**49%**。剩下的 14 个能画的块（三百个角度的乘法、一百万播放对一千、每天十条私信与价格区间）一次集中全部蒸发，脚本毫无反应。

所以 plan 里要加一层 `blocks`（可以内嵌，也可以用 `blocks_file` 指向同目录的块表），并在 `pages` 里写清每页接哪几块：

```json
"pages": [
  {"id": "07-brand", "kind": "figure", "blocks": ["b17", "b18", "b03"]},
  {"id": "15-end",  "kind": "quote",  "blocks": ["b52"]}
],
"blocks_file": "dankoe-blocks.json"
```

块表每条：`id / ch / line[起,止] / type / claim / figure(能不能画) / why(不画的原因) / grp(同一个断言的分组) / anchor(可选，逐字原文)`，可选 `page`（没写 `pages` 时用它落页）。

`plan_check.py` 的覆盖规则：

| 规则 | 判定 |
|---|---|
| 每个 `figure: true` 的块必须被某页接住 | 漏一块 → **FAIL**，并印出行号和那句 claim |
| 块的行号必须落在原文行数内 | 越界 → FAIL（防止块表是编的） |
| 块写了 `anchor` 就必须逐字命中原文 | 查不到 → FAIL |
| 能画的块要有 `anchor`（这一块的原文依据） | 没写 → WARN（图容易画成印象） |
| `figure: false` 的块必须写 `why` | 空 → WARN（不画也要交代去向：引文页／脚注／不画） |
| 一页接的块 ≤ 3；同属一个断言组时放宽到 9 | 超 9 → FAIL 必须拆页；超 3 且跨组 → WARN「一页在代替多页」 |
| `page` 引用的页必须在 `figures` 里存在 | 不存在 → FAIL |

跑法不变：

```powershell
python scripts/plan_check.py plan.json <article.md>
```

输出第一行就是这次的账，先看它再看 fail：

```
COVER  blocks 53 · 可画 36 · 接住 36 · 漏 0 · 不画已交代 17 · 页 15 · 按每页 3 块的下限 12 页 · 断言组 20
```

张数由此变成可算的：`ceil(可画块 / 3)` 是硬下限，按断言组归并后是实际页数。这篇 36 个能画块 → 下限 12 页，按组归并 **15 页**，全部覆盖；想压到 12 页就得接受 3 处「一页接 4 块」的 WARN，那正是 6 页版犯过的毛病。

## 五步

### 1. 读成论断，不是读成段落

每条 `claim` 是**一句可被反驳的话**，配 `anchor_quote`（**逐字复制**原文一句）。审计器靠它查你有没有编。

- 好：「233 亿的经营利润被一笔减值打掉 162 亿」
- 坏：「财务表现」——章节标题不是论断

### 2. 让 AI 回答「这段该配哪张图」——先读全文，再给多选

**这一步是 AI 的工作，不是手感。** 三个硬要求：

1. **必须先读完全文**再建议。只读摘要、只读标题、只看前两节就选图型，等于没读。
2. **每段至少给 3 个候选图型**，每个候选写四行：这张图让读者看见什么关系 / 为什么它比另外两个好 / 它会丢掉什么 / 画它的代价（节点数、要不要断轴、要不要标推断）。只给一个答案 = 没比较过。
3. **让人选，或自己选但记账**。人不在场时自己选，并在 plan 的 `type_choice` 里写明「选中谁、否掉谁、为什么否」——被否掉的候选不是废纸，它是下次换稿时的备选。

判断顺序：读者该看见**什么关系**（时间 / 量 / 结构 / 流程 / 层级 / 关系 / 方法，见 `references/type-shortlist.md`）→ 换成三列表格会丢什么（丢不掉就别画）→ 焦点在哪（1–2 处）。

完整规程与可粘提示词在 `references/figure-plan.md`。

### 3. 写 plan.json，交给审计器

```powershell
python scripts/plan_check.py plan.json <article.md>
```

查七件事：`article_map` 与 `figures` 两边能对上（每张图有归属、总数相等、不画的节写了理由）；`anchor_quote` 逐字命中；数字要么原文有、要么在 `honesty_flags` 里承认；单图预算（节点 ≤9、箭头 ≤12、焦点 ≤2）；同型两张必须各带不同 `variant`；`count_policy` 与实际张数对得上；`dropped` 非空（说明你删过）。

### 4. 画

```powershell
python scripts/make.py            # 出 N 页 HTML
```

`make.py` 里每个图型一个函数，**写这篇就照这篇的图改函数**；跨篇复用只复用图型函数，不要复用某篇的文案。改样式改 `style.json`，不要改 `make.py` 里的字面量。

要手机画幅（小红书 / 抖音图文）就换成竖版页壳：`from shell34 import page, open_svg, txt, line, arrow_defs`，八个纵向图型与文案仍写在本文的 make 脚本里，坐标见 `references/size-3x4.md`。

### 5. 三道门禁

```powershell
python scripts/shot.py out --size 1080x800    # 截图：横页报宽高，3:4 用默认 1080x1440
python "$env:DIAGRAM_SKILL_DIR/scripts/verify_geometry.py" *.html   # 连接线 / 遮挡（diagram-design 自带，本 skill 只引用不复制）
python scripts/trim.py                        # 按纸色裁掉每页底部空白（截图窗口比页面高）
python scripts/verify_clean.py *.html         # 剥 @font-face 后跑 self_check
python scripts/sheet.py                       # 拼总览，人眼再看一遍（格子按张数自动算行）
```

`shot.py` 按固定画幅截，页面多高窗口就多高：**3:4 页高固定 1440，不需要 trim**（没有多余留白可裁）；横页仍要 trim，因为页高是算出来的。

跑之前把 `DIAGRAM_SKILL_DIR` 指到 diagram-design skill 目录，否则第一条会找不到文件。

`verify_clean.py` 存在的原因：`self_check` 把任何非 `#fragment` 的 `url()` 判成外部资源，**data: 字体也一起误杀**，不剥掉就永远一片 FAIL。

## 画幅：横页 16:9 与竖页 3:4

两套页壳，同一套样式机制。选哪个看发布渠道，不看内容。

| 画幅 | 页壳 | 尺寸 | 用在哪 |
|---|---|---|---|
| 横页 | `scripts/make.py` | 1080×800，图内宽 952 | 公众号插图、网页正文、视频素材 |
| 竖页 3:4 | `scripts/shell34.py` | 1080×1440，图内宽 952 | 小红书、抖音图文（两平台共用） |

**3:4 不是把横图放大**：页高从 800 拉到 1440，横向的左右分栏会缩成细线，必须换纵向构图
（百格网格、零轴横条、分叉树、泳道、汇流、能力阶梯、水平零轴柱、时间台阶……）。
八种已跑通的图型、封面版式与踩过的坑都在 `references/size-3x4.md`，用它之前先读。

封面走 `scripts/cover34.py`，出图截图走 `scripts/shot.py`（默认就是 1080×1440）：
**小红书与抖音共用一张封面**，照片必填，标题三行短句每行 ≤6 字，不放目录。

## 样式：默认值 + 覆盖，不写死

`scripts/style.example.json` 是全量键。优先级：`FIGKIT_STYLE` 环境变量指向的 JSON > 输出目录下的 `style.json` > `make.py` 内的 `STYLE_DEFAULTS`。

```json
{
  "page_width": 1080, "pad": "52px 64px 40px",
  "paper": "#f5f5f5", "ink": "#2d3142", "muted": "#4f5d75", "soft": "#5a6580",
  "accent": "#bf4520", "accent_tint": "rgba(191,69,32,0.08)",
  "font_body": "\"Noto Sans SC VF\",sans-serif",
  "font_title": "\"Huiwen Mincho\",serif",
  "font_dek": "\"LXGW WenKai Screen\",serif",
  "font_num": "\"EB Garamond\",serif",
  "h1_size": 62, "dek_size": 18.5, "callout_size": 26,
  "font_kinds": ["sans", "wenkai", "gara", "huiwen"]
}
```

改一项就够的情况：换纸色只改 `paper` / `paper` 系；换标题字体只改 `font_title` 并在 `font_kinds` 里加上对应族（族名见 `references/font-stack.md`）。**不要把某篇的字号抄进脚本**，抄进去下一篇就得回来改。

**画幅不是改一项的事**：只把 `page_width` 与 `pad` 换成竖的，页高仍是 800，图和字会挤成一团。
3:4 换的是页壳（`shell34.py`，页高 1440 + 纵向构图 + 整套竖版字号），键名与取值见
`references/size-3x4.md` 第二节。

## 硬规矩（结构、诚实，这两类不许覆盖）

**结构**

- 不许每个节点一样大——层级没画出来。
- 不许阴影；圆角 0–6px。
- 焦点色一页 ≤2 处。
- 图例只许底部横条。
- 单图 节点 ≤9、箭头 ≤12，超了拆图（**拆的是图，不是拆文章**）。
- 箭头标签必须有遮挡 rect；连接线只许正交（圆环是唯一例外）。

**诚实**

- 图上数字必须与原文对得上；推出来的标「推断 / 反推 / 残差」，**图上与脚注各标一次**。
- 原文没有的因果链，图注写「作者归纳，非原文直述」。
- 定性坐标标「定性落位，非连续刻度」。
- 候选图型被否掉的理由写进 `type_choice`，别在对话里丢掉。

## 目录

```
article-figures/
  SKILL.md
  scripts/
    doctor.py        体检 python / pillow / lxml / chrome / 字体 / diagram-design
    fetch_fonts.ps1  从 npmmirror 拉字体包（~160MB，不入 git）
    make.py          图型函数 + 页面壳（样式全部读 STYLE）
    shell34.py       3:4 竖版页壳（1080×1440，样式同一套 STYLE）
    cover34.py       3:4 封面页壳（小红书 / 抖音共用一张）
    shot.py          按固定画幅截图（默认 1080×1440，自找 Chrome）
    fontkit.py       按页挑分片 / subset / base64 内联
    trim.py          按内容裁底部空白
    sheet.py         网格拼总览（列数、行数按张数算）
    plan_check.py    plan 审计（quote / 数字 / 预算 / 同型 / 图数区间 / 分卷）
    verify_clean.py  剥 @font-face 后复跑 self_check
  references/
    figure-plan.md      配图规程 + 可粘提示词（含「多给候选」的要求）
    type-shortlist.md   50 种图型里常用的那二十来个
    font-stack.md       字体分工、旧字形授权、踩过的坑
    size-3x4.md         3:4 竖版：画幅参数、纵向图型词典、封面规矩、像素回归
    style.example.json  样式全量键
  templates/
    example.plan.json   一份完整 plan（含 count_policy / type_choice 写法）
```

## 与 text2Media 其它 skill 的分工

| 要什么 | 走哪 |
|---|---|
| 文章 → 图解页 PNG | **本 skill** |
| 文章 → 平台比例卡片 | `image-cards` |
| 图解页 → 口播动画 MP4 | `card-video`（需 9:16 `.card` 结构，见 `docs/出图流程_固化与使用_2026-11-15.md` 第七节） |
| 文章 → 公众号排版 | `wechat-layout` |
| 短视频脚本 | `explainer-video` |

顺序：`article-fetch` → `article-rewrite`（可选）→ **`article-figures`** → `card-video`。图先立住，视频才有素材；反过来一定变成「给文字配文生视频」。

## 依赖与已知限制

- **Python**：`fonttools`、`brotli`、`pillow`、`lxml`（汇文明朝体是 OTF + SVG 表，必须 lxml）。
  国内：`python -m pip install fonttools brotli pillow lxml -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com`
- **Chrome** 无头截图，`--virtual-time-budget=8000` 等字体就位。
- **字体** ~160MB，走 `fetch_fonts.ps1`，不入 git。
- **京華老宋体** `All rights reserved`，只本地比对，**不许内嵌发布**。
- **未解决**：本篇图一（timeline）SVG 上方约 130px 空膛；`make.py` 还没按 plan 自动分派图型（现在仍靠人接图型函数）；安装版 diagram-design 缺 `verify-waterfall.py` / `verify-steps.py`，这两项结构校验从未跑过。
