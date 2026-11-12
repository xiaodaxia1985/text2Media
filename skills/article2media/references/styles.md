# 风格（主题）

主题只是一个 CSS 文件：`engine/themes/<名称>.css`。它定义调色板、字体、圆角档位和阴影；材质结构（白卡、磨砂胶囊、浅灰井、黑底白字强调胶囊）和排版骨架都下沉在 `engine/layouts/` 里。
所以**同一份 content.json、同一篇文章可以用任何主题渲染**，长图、卡片、公众号都适用，换风格不用改内容。

```bash
node <long-image>/scripts/long.mjs --list                                    # 列出所有主题（任何渲染脚本都支持 --list）
node <long-image>/scripts/long.mjs content.json                              # 用 content.json 里的 "theme"（默认 apple-hark）
node <long-image>/scripts/long.mjs content.json --theme apple-hark-warm      # 指定主题（覆盖 content.json）
node <long-image>/scripts/long.mjs content.json --theme apple-hark,apple-hark-dark   # 多个主题，分目录输出
node <image-cards>/scripts/cards.mjs content.json --ratio 3:4                # 小红书 3:4；抖音图文用 --ratio 9:16 或 3:4
node <article-rewrite>/scripts/export.mjs content.json --theme apple-hark    # 公众号图文：rewrite.md + 主题化图表 PNG
node <wechat-layout>/scripts/wechat.mjs article.md --theme apple-hark        # 公众号文章排版：可粘贴 HTML + 封面
```

注意：`export.mjs` 的 `--theme` 一次只接受一个主题（不接受逗号分隔）；`long.mjs` / `cards.mjs` / `wechat.mjs` 支持。

## 内置主题

| 名称 | 气质 | 首选场景 |
|---|---|---|
| `apple-hark`（默认） | 苹果 Hark 浅色：灰白底一丝天蓝渐变、白色大圆角卡片、磨砂胶囊标签、黑底白字强调胶囊、柔和弥散阴影 | 科技产品解读、AI 应用、新品发布、设计方法论、商业与数据叙事；全平台通用，没指定就选它 |
| `apple-hark-dark` | 苹果 Hark 深色：近黑底带冷光、浮起深灰卡、白底黑字胶囊强调、iOS 系统色点缀 | AI / 编程 / 开发者工具等技术向内容；信息流里想要深色封面时用它 |
| `apple-hark-warm` | 苹果 Hark 暖纸：暖白纸底、焦糖棕品牌色、白卡与黑胶囊不变、大地色辅助 | 人文随笔、个人经历与复盘、生活方式、教育与出版；想要更"纸感"、更少科技味时用它 |
| `apple-flow` | 苹果蓝白交互：纯白纸 + 顶部一层冷光、只留 iOS 系统蓝一个强调色、发丝描边图卡、居中蓝胶囊结论 | 产品与方法论、建站与工具、商业实践；想要"像苹果官网一样干净"时选它，3:4 / 9:16 都成立 |
| `hark-noir` | Hark 深色玻璃：夜空渐变底、半透明玻璃卡 + 1px 高光边、白色胶囊做激活态、发丝彩色方框 | AI / 技术 / 设计、开发者工具；抖音与小红书信息流里的深色封面 |
| `paper-editorial` | 纸感编辑：暖白纸、华文中宋衬线标题、朱红单点、1px 线与编号建立秩序、左线引文替代胶囊 | 复盘、长文、经验总结、公众号与人物叙事；要"读完可信"而不是"刷到好看" |
| `signal-swiss` | 瑞士信号：纯白 + 墨黑 + 单点信号橘、直角、黑块标签、通栏橙色信号条 | 强观点、数据结论、抖音首图；缩略图辨识度最高，信息流里最跳 |

旧版 21 套主题（editorial、swiss、glass、bento、riso、y2k 等）已于 2026-11-12 从仓库移除（只做仓库瘦身，文件本身没坏）。
要恢复某一套，从 git 历史取回即可：

```bash
git show 657774a:skills/article2media/engine/themes/legacy/editorial.css > skills/article2media/engine/themes/editorial.css
```

现在 `--list` 列出的是 7 套在册主题。新增主题仍按上文「新建主题」复制一套改名。

## 选择指南（用户没指定主题时，由你来选）

按顺序走，**命中一条就停**：

1. **用户对风格提了明确要求**，就直接用：要求苹果/系统蓝/蓝白/干净 → `apple-flow`；要求深色 / 暗黑 / 夜间 / Hark 那种玻璃感 → `hark-noir`；要求暖色 / 纸感 / 人文 / 温柔 / 杂志编辑感 → `paper-editorial`；要求瑞士 / 直角 / 强对比 / 印刷海报感 → `signal-swiss`；只说深浅不点名 → `apple-hark-dark` / `apple-hark-warm`。文章里出现的词不算（讲"焦糖拿铁"不等于要焦糖主题）。用户有自己的品牌色或固定风格时，以用户为准。
2. **默认 `apple-hark`**。它是为全平台设计的默认主题：长图、小红书 3:4、抖音 9:16 与 3:4、公众号图文与文章排版都成立。
3. 两个例外可换 `apple-hark-dark`：通篇是给开发者看的技术内容（编程、工具搭法、原理拆解），或用户明确想要信息流里的深色封面。其余题材不换。
4. **按平台补一条**（同一篇要多平台分发时）：小红书正文/复盘长文 → `paper-editorial`；抖音首图与数据结论 → `signal-swiss`；AI/技术/深色封面 → `hark-noir`；产品与方法论 → `apple-flow`。一套系列内容尽量固定一个主题，让读者在信息流里认得出你。

选定后把 `"theme": "<名称>"` 写进 content.json（只排文章时，用 `--theme` 传给脚本）。同一篇既出长图又出卡片且想区分时，写成 `"theme": {"long": "apple-hark", "cards": "apple-hark", "wechat": "apple-hark"}`。交付时用一句话说明理由，例如："选了 apple-hark-warm：个人复盘题材，暖纸底比灰白底更贴叙事感。"

拿不准时可以 `--theme 甲,乙` 出两版，看 overview 挑一个，最后只交付推荐的那版。

## 换品牌色

主题的强调色序列是「1 墨色（浅色主题黑 / 深色主题白）→ 2 品牌主色 → 3-6 同色相的明度阶或中性墨阶」，各节依次轮换：

- **3–6 必须是 2 的同色相深浅阶，或中性墨阶，不能另起色相**。引擎按节递增轮换 `--accent-1…n`，一旦 3–6 写成藏青、墨绿、赭石，第 3、4 节就会在黑白主调里冒出别的颜色——用户一眼就能看出"配色体系坏了"。
- **换品牌色只改 `--accent-2`，并把 `--accent-4` / `--accent-6` 同步改成它的深/浅阶**（这两个在图表序列里与 2 相邻出现）。
- 语义色（通过 / 代价）单独用 `--ok` / `--bad`，固定不轮换；只在"没通过"那一侧上色，别让 `--acc` 决定对错颜色。
- `--accent-1` 保持黑（深色主题保持白）：黑胶囊 + 黑高亮是这套设计的骨架，不要把强调主色改成彩色。
- 临时调用不想改主题文件，可以直接在 content.json 里建一个 `"brand"` 或复制主题文件改名（见下）。

长期用某个品牌色时，复制一份主题改名（如 `apple-hark-brand.css`，第一行注释写 `/* apple-hark-brand | 品牌定制：…… */`），只改 accent 序列，之后 `--theme apple-hark-brand` 调用。

## 新建主题

复制一个现有主题改变量即可。第一行注释的格式是 `/* 名称 | 气质描述；适合：…… */`，`--list` 和选择时都会读它。
主题 CSS 在版式 CSS **之后**加载，所以主题里写的结构覆盖规则会生效。

这套设计有**三层材质**，主题只给它们上色：

| 材质 | 用在哪 | 关键变量 |
|---|---|---|
| 不透明白卡 | 图卡、面板、白卡封面、公众号目录 | `--fig-bg`、`--card`、`--panel-fill`、`--card-shadow` |
| 磨砂胶囊 | 节标签、kicker、部分横幅、结尾卡 | `--label-bg`、`--label-edge`、`--label-blur`、`--closing-bg` |
| 浅灰井 | 引言、代码、引用、图内方框 | `--well-bg`、`--box-bg`、`--box-border` |
| 黑胶囊强调 | 节金句、部分横幅、封面分隔条 | `--pill-bg`、`--pill-ink`、`--pill-shadow` |

```css
/* my-theme | 一句话气质；适合：…… */
@import url('https://fonts.googleapis.com/css2?family=...&display=block');   /* 可选：网络字体 */
:root {
  /* 字体 */
  --font-head: '…', sans-serif;   /* 标题字体（Hark 系是 Inter + Noto Sans SC，--w-title/--w-h2: 800） */
  --font-body: '…', sans-serif;   /* 正文字体 */
  --font-label: …;                /* 可选：小标签（编号、"图 1A"）的字体 */
  --w-title: 800; --w-h2: 800;    /* 可选：标题/节标题字重 */
  --h2-ink: #…;                   /* 可选：节标题颜色（默认跟 ink） */

  /* 底色与渐变 */
  --bg: #…;                       /* 页面底色 */
  --bg-image: …;                  /* 可选：底上的渐变图（长图按 --bg-size 铺贴，卡片拉伸铺满） */
  --bg-size: 100% 2400px;         /* 配合 --bg-repeat: repeat 长图铺贴；卡片里默认改 no-repeat 拉伸 */
  --bg-repeat: repeat;

  /* 墨色与线 */
  --ink: #…;                      /* 正文色 */
  --muted: #…;                    /* 次要文字 */
  --rule: #…; --rule-soft: #…;    /* 分割线 / 浅分割线 */
  --sec-rule: 1px solid #…;       /* 可选：节分割线（默认 1px solid --rule） */

  /* 三层材质 */
  --fig-bg: #FFFFFF;              /* 图卡底 */
  --card: #FFFFFF;                /* 白卡 */
  --panel-fill: #FFFFFF;          /* 面板底（目录、表格、卡片组） */
  --card-shadow: 0 18px 44px -20px rgba(30, 45, 70, .18), 0 2px 6px -4px rgba(30, 45, 70, .06);  /* 弥散阴影 */
  --well-bg: rgba(29, 29, 31, .05);    /* 浅灰井：引言/引用/代码底 */
  --box-bg: rgba(29, 29, 31, .045);    /* 图内方框底 */
  --box-border: 0;                     /* 图内方框描边（Hark 默认无边框） */
  --panel-mix: 6%;                /* 面板底色 = 主色按这个比例混进底色（面板未给 --panel-fill 时生效） */

  /* 磨砂胶囊 */
  --label-bg: rgba(255, 255, 255, .66);  /* 胶囊底（半透明白=磨砂感） */
  --label-edge: inset 0 0 0 1px rgba(29, 29, 31, .07), 0 1px 3px rgba(20, 30, 50, .06);  /* 发丝边+微影 */
  --label-blur: blur(16px);              /* 背景模糊（公众号图文版式不用 blur，其他版式都支持） */
  --closing-bg: rgba(255, 255, 255, .8); /* 结尾卡底 */

  /* 黑胶囊强调 */
  --pill-bg: #1D1D1F;             /* 金句/横幅胶囊底（dark 主题里反转为白） */
  --pill-ink: #FFFFFF;
  --pill-shadow: 0 14px 30px -14px rgba(0, 0, 0, .45);

  /* 圆角档位 */
  --radius: 28px; --radius-sm: 15px;

  /* 清单里的深色"护栏"卡（dark 主题反转为白卡） */
  --guard-bg: #…; --guard-ink: #…; --guard-muted: #…; --guard-x: #FF453A;

  /* 强调色序列（各节依次轮换；2 是品牌主色，3-6 只能是同色相明度阶或墨阶，禁止新色相） */
  --accent-1: #…;
  --accent-2: #…;
  --ok: #…; --bad: #…;           /* 语义色：固定，不跟节轮换 */
  --on-acc: #…;                   /* 可选：主色底上的文字颜色（深色主题通常要设成深色） */
}
/* 长图铺贴渐变、卡片拉伸铺满（复制 apple-hark 末行即可） */
.card { --bg-size: 100% 100%; --bg-repeat: no-repeat; }
```

可选变量：
- `--acc-text-override`、`--acc-line-override`：主色太浅（比如黄色）时，用它们把"主色文字"和"主色细线"统一改成深色。
- 排版：`--fs-title`、`--fs-h2`、`--fs-body`、`--sheet-bg`（清单阶段底）、`--warn`。
- 背景渐变不想要了，设 `--bg-image: none;` 即可回到纯色底。

注意：
- 黑胶囊（`--pill-bg`）和强调主色（`--accent-1`）是这套设计的骨架，新建浅色主题保持黑色、深色主题保持白色，只换品牌色和辅助色。
- 主色要和 `--bg`、`--card` 有足够对比度，因为它会用于小标题和高亮方框的底色。
- 深色主题里，`--on-acc` 通常要设成深色；`--card-shadow` 里加一圈 `0 0 0 1px rgba(255,255,255,.08)` 当发丝边，深色卡才有轮廓。
- 字体要选覆盖简体中文的字体，并在字体栈末尾留系统字体作回退（如 `'PingFang SC'`、`'Microsoft YaHei'`）。
- 换了展示字体后，渲染一行"回图国圆品器噩"这类内外多层框的字看一眼：有的字体（比如站酷小薇）会把"回"画成实心黑块，版面检查发现不了。
- 新主题做好后，用 `examples/gallery.json` 把长图和 `--ratio 3:4` 卡片各渲染一遍，检查所有图表组件；要上公众号的话，再跑一遍 `export.mjs` 和 `wechat.mjs`。
