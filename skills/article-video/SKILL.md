---
name: article-video
description: 把一篇中文文章做成一支配音图解短片——每镜一张自建图解页，屏幕大字与版面由文章结构自动推出（不是人挑版式），横竖画幅跟着页面比例走。当用户要求「把这篇做成视频」「图解出个视频版」「用这些页快速出一支片」「同一篇文章出个 16:9 短片」「这十张图做成口播视频」时使用。出图（article-figures）与出片是两条独立产物，只共享输入文章；本 skill 不负责图怎么画，也不负责改成竖屏卡页。
metadata:
  short-description: 文章 → 每镜怎么拍 → 出帧 → 成片
---

# Article Video

一支图解短片就三件事：**这十镜分别讲什么、每镜用哪种图文关系、字是谁写的**。三件都不该临时拍脑袋：
镜次来自文章结构，图文关系来自这一镜在干什么，屏幕大字来自 plan 里已有的 `claim`。

**这个 skill 只做「构图 + 出帧 + 交给渲染」，不重新画图。** 页由 `article-figures` 出（已经验收过的那十页就是素材），也可以是任何同纸色的自建页；两条线**只共享输入文章**，不要求出图时顺便把页做成竖屏——那是让两边互相凑合。

## 一、四步

| 步 | 命令 | 产物 |
|---|---|---|
| 1. 推每镜怎么拍 | `python scripts/shot_plan.py plan.json shotplan.json [--headlines heads.json]` | 每镜 `layout / beat / frames / why / alt`，附 0-fail 断言结果 |
| 2. 出帧 | `python scripts/compose_layouts.py <页面目录> <帧输出目录> shotplan.json [--only A,B]` | 1920×1080 整帧 PNG，一帧一页；标了 `frames:2` 的镜多出一张 `<页名>b.png`（推近） |
| 3. 拼渲染脚本 | `python scripts/build_script.py <帧目录> <alignment.json> out.script.json --media-prefix assets/media/<目录>/ --source-url …` | 渲染引擎要的 `script.json`：时长抄自配音对齐，运镜按版式映射 |
| 4. 成片 | `node <repo>/video/make.mjs out.script.json --skip-voice` | `output/<日期>/抖音/.../video.mp4` |

第 4 步复用 `video/` 抽屉（HyperFrames 0.9.41 + 本地 VoxCPM 配音 + Whisper 对齐），`make.mjs` 一条命令走完：校验→配音→合成→混音→渲染。**画幅不写死**：`build_script.py` 从帧的实际尺寸写出 `size:{w,h}`，`make.mjs` 透传 `--w/--h`，横页出 16:9、竖页出 9:16；`data-resolution` 自动切 landscape/portrait。

## 二、版式由文章推，不由人选

这一步的输入全是 plan 里已经有的东西：

- `claim`（这张图证明哪句话）→ 句子长短、有没有「不是…而是…」、有没有两个数字
- `reads_as`（读者该看见什么）→ 写了「细节 / 局部 / 一角」就该开窗放大
- `figure_type`（这镜是什么形状）→ 是结构、过程、对比，还是给数

**先判 beat（这镜在干什么）**：首镜=起手、末镜=收束；claim 里有「不是/而是/对上/旁边」=对比；结构类图型（unit-grid / kanban / layers / nested / venn / steps / loop / quadrant / tree / pyramid）=拆解；过程类（waterfall / timeline / sankey / journey / gantt）=过程；两个以上数字、或柱/差值/哑铃=给数；其余=叙述。

**再按 beat 取候选**：起手→C/B/A，叙述→A/B/D，过程→D/E/B，对比→I/J/B，拆解→G/H/E/J，给数→A/H/I/B，收束→L/I/K。两个修正：`reads_as` 有细节词 → 开窗 H 提前；句子 >18 字 → 剔竖排单列，≤12 字 → 剔双列并优先 C。

**最后过全局约束**（这些是 FAIL，不是「看着顺眼」）：

| 约束 | 为什么 |
|---|---|
| 相邻两镜不同版 | 连着两镜一个手法，第三镜观众就走了 |
| 首镜不许切页/开窗/出血/压边 | 开场得先把整页立住，否则第一秒看不懂这是什么 |
| 末镜压边（撞了改出血） | 收束要「翻过去」的手感 |
| 长句不许进竖排单列；短句用双列只算 WARN | 竖排吃字，一句 22 字会顶出画面 |
| 全片至少一套竖排、一套重手法 | 横排铺到底，画面没有呼吸 |
| 8 镜以上要有一次巨号编号 | 中段给观众一次节奏点 |
| ≤12 镜时一套版只用一次 | 库里有 12 套，够轮；重复是懒 |
| 每镜必须写 `why` | 说不出它服务哪句话，就别用这套 |

### 一页两拍（`frames`）

一页一镜是底线。信息密的页给两拍：**第一拍全景，第二拍推近**（`compose_layouts.py` 按画面重心裁 1/1.26 再放回原尺寸，音频仍是同一段、时长对半分，不用重配）。

什么时候拆，也由 plan 里的话决定：

- `reads_as` 写了「细节 / 局部 / 一角」且是拆解类 → 这页有个点值得再看一眼；
- 拆解类 claim 超过 18 字、过程类超过 22 字 → 一页要装两层意思，一拍讲不完。

首镜、末镜永不拆（开场要一次立住整页，收束要一次到位）；10 镜最多 2 处拆拍——全是推近，就不叫推近了。这两条都是 FAIL，不是建议。

同一篇文章，机器排出来的顺序和人手排的会不一样，这是好事——**这一步的价值就是不用人再做一遍审美决策**。

## 三、十二套版面（`compose_layouts.py`）

画的不是「文字放哪」，是**页与字的图文关系**：字压页、页遮字、页开窗、竖线分栏、巨号垫底、字出血。全表与踩坑见 `references/layouts.md`。

| 版 | 手法 | 一句话 |
|---|---|---|
| A / B | 页左·字右横排 / 页右·字左横排 | 最稳，底色用 |
| C / D | 页左·竖排单列 / 页右·竖排单列 | 批注口吻，短句 |
| E | 页左·竖排双列 | 长句也能竖 |
| F | 批注式：页铺满，小字竖排在页外 | 页自己就是主角 |
| G | 字块切页：字压页右侧留白，纸色底衬只压 58px | 图文咬合 |
| H | 开窗放大：右下开一块「局部放大」，裁右下 52%×48% | 用放大代替重讲 |
| I | 字出血：92px 巨字贴边 | 全片结论句 |
| J | 竖线分栏：一条线切开，字在左竖排 | 转折 |
| K | 巨号编号垫底（190px `06`） | 只调节奏 |
| L | 出血压边：页右侧出画 62px | 收尾 |

编排器 `PREFER` 按字数分 band 选版并避开最近两镜；也可以像样例那样在 `--headlines` 里显式给 `layout`，显式优先。

## 四、屏幕大字谁写

**由 AI 从 `claim` 重写，不是手写项。** `scripts/conclusions.py` 只是没人盯时的机械兜底：砍时间前缀 → 在标点边界取最长窗口 → 砍两三个字的悬空拖尾（`--max 26`）。机器压出来的句子会断半句（「执掌 33 年的 CEO 把总裁」），所以有 AI 在场时必须自己重写。

## 五、硬规矩（构图、诚实）

**构图**

- 页与字**不许互相遮挡正文**：纸色底衬只压页面右侧留白那 58px；出血压边只在 62px 以内；开窗裁的是页面局部，不许把整页缩小再放一遍（那是「复制两遍」，不是放大）。
- 页面缩放全片用**同一个系数**，否则每镜字大小跳动，像不同的片子拼起来。
- 大字基线至少距画面边 40px；竖排字列间距 ≥ 相邻两列字宽。
- 一镜只说一句话。一句讲不完就先拆镜，不是缩字号。

**诚实**

- 屏幕大字必须能落回 `claim`；`claim` 又必须能落回原文（`article-figures` 的 `plan_check.py` 已经查过 `anchor_quote`）。
- 数字、金额、时长不得在构图层新增；构图层只搬字，不造事实。

## 六、目录

```
article-video/
  SKILL.md
  scripts/
    shot_plan.py       从 plan 推每镜 beat + 版式 + 帧数 + why，自带 FAIL 断言
    compose_layouts.py 十二套版面 + primitives（page_at/htext/vtext/idx/rule）+ 推近帧
    build_script.py    帧目录 + alignment.json → script.json（时长抄配音，运镜按版式）
    conclusions.py     claim → 屏幕大字的机械压缩（兜底用）
  references/
    layouts.md         十二套手法详解、参数、三处踩过的坑
  templates/
    example.shotplan.json  一份完整 shot plan（含 why / alt / frames）
```

## 七、依赖与已知限制

- **Python**：`pillow` 足够，不需要浏览器。
- **字体**：屏幕大字用汇文明朝体（`.otf`）。不写死路径：`ARTICLE_VIDEO_FONT` 指文件，或 `FIGKIT_FONTS` 指字体根目录（与 `article-figures` 共用）。找不到会明确报错，不会静默换字。
- **渲染**：需要 `video/` 抽屉（Node + HyperFrames + 本地 VoxCPM）。没配音时加 `--skip-voice` 复用已有 `narration.wav` / `alignment.json`。
- **已知限制（都在代码里留了印记，不是"以后再说"）**：
  - 推近帧按**整帧重心**裁，不是按某个元素推；图上要精确推某根柱，得在 shot plan 里手写 `focus:{x,y}`（字段还没实现）。
  - `build_script.py` 要求帧数与配音镜数一致：改镜数就得重配音，这是引擎侧的约束，不是本 skill 能绕开的。
  - 竖版（1080×1920）要改 `compose_layouts.py` 头部的 `W/H` 常量，还没做成 `--size 1080x1920` 参数。
  - `K` 的巨号按镜次奇偶换角（左上 / 右下），但只支持这两个角。

## 八、与其它 skill 的分工

| 要什么 | 走哪 |
|---|---|
| 文章 → 图解页 PNG | `article-figures`（本 skill 的素材来源） |
| 图解页 → 16:9 / 9:16 图解短片 | **本 skill** |
| 平台比例卡片 → 竖屏卡片动画 | `card-video` |
| 分镜式讲解片（自己搭镜头） | `explainer-video` |

顺序：`article-fetch` → `article-rewrite`（可选）→ `article-figures` → **`article-video`**。
两条线只共享输入文章：出图那边不必为视频改布局，出片这边也不必复用出图的那套排法。
