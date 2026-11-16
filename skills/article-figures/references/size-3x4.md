# 3:4 竖版（1080×1440）

同一批论断，换成手机画幅再排一遍。**换的不是画幅，是构图**：横页 1080×800 靠左右分栏吃宽度，
竖页只有 952 宽、1440 高，横向排两栏必然挤成一条细线——所以纵向图型另立一册。

页壳：`scripts/shell34.py`（页壳 + 样式 + SVG 小工具）。封面：`scripts/cover34.py`。截图：`scripts/shot.py`。

## 一、什么时候值得换

| 事实 | 数 | 对排版的意思 |
|---|---|---|
| 小红书 3:4 竖版在信息流里占位最高 | 3:4 > 1:1 > 4:3 | 主发图一律 3:4，不裁边 |
| 抖音图文首图 | 3:4 | 与小红书共用，不必为平台改一版 |
| 抖音视频封面 | 9:16 | 顶部约 220px、底部约 380px 被 UI 压住，字必须躲开这两条 |
| 抖音主页缩略 | 接近 1:1 | 封面文字要居中带，靠边的内容看不见 |
| 每多 1 个封面字符 | 平均少约 1000 次观看 | 标题 10–12 字，每行 ≤6 字 |
| 每多 1 张人脸 | 平均多约 4.5 万次观看 | 封面必须有配图，人像越大越好 |
| 换底色 | 影响点击 18–25% | 对比度比装饰有用 |
| 中文 AI 类爆款封面 | 46.7% 纯画面无大标题；有标题的多为 11–15 字 | 标题可以少，但不能是目录 |

结论：**图解页走 3:4（小红书 / 抖音图文），封面两个平台共用一张 1080×1440。**
横版（16:9 那套）留给公众号插图、网页正文与视频素材。

## 二、画布参数

```
page_width   1080        页宽
page_height  1440        页高固定，不随内容伸缩
pad          "74px 64px 56px"
figure_width 952         图内坐标宽 = 1080 - 64*2
```

| 元素 | 字号 / 尺寸 | 说明 |
|---|---|---|
| h1 | 70px / 1.16 / w400 | 比横版 62 大一档；手机屏上 62 看着像副标题 |
| dek | 21px / 1.82 / 900 宽 | 走在图前，不能占满一屏 |
| callout | 31px / 1.6 / 880 宽 | 页尾结论，一条就够 |
| mark（图序号） | 19px（Noto Serif） | 与 eyebrow 14px 同排 |
| legend | 13px，色块 11px | 只做底部横条 |
| foot | 12px，右对齐 | **左边那句来源小字不写**，见第七节 |

样式机制与横版同一套：`FIGKIT_STYLE` > `OUT/style.json` > `shell34.py` 里的 `STYLE_DEFAULTS`。
想改纸色、字号、页高，改 JSON，别改脚本里的数字。

比横版多出来的键：`page_height`、`figure_width`、`mark_margin`、`figure_margin`、`legend_gap`、`foot_color`；
同名键里 `h1_size`、`dek_size`、`callout_size`、`mark_size`、`label_size`、`legend_size`、`foot_size`
的默认值都比横版大一档（手机屏上横版那套字号看着偏小）。

## 三、页面壳怎么用

```python
import os, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, r"<repo>/skills/article-figures/scripts")
os.environ.setdefault("FIGKIT_OUT", str(HERE / "out"))
os.environ.setdefault("FIGKIT_FONTS", r"<repo>/.cache/design-kit/fonts-src")

from shell34 import (ACCENT, INK, MINUS, MUTED, PAGE_H, PAPER, RULE_SOLID, SOFT, W,
                     arrow_defs, line, numspan, open_svg, page, txt)
```

`page(fn, title, eyebrow, h1, dek, svg, legend, tag, callout="")` —— **九个参数，没有 `src`**。
图序号由文件名数字推出（`01-…` → 图一）。`open_svg(h, title, desc)` / `txt` / `line` / `arrow_defs`
三件工具横竖通用，直接从页壳 import，不必每篇重写。

每个图型一个函数，函数里只放这篇的坐标与文案：跨篇复用图型，不复用某篇的字。

## 四、纵向图型词典（已跑通的八种）

竖页的问题是「一条窄长」：横向的对照关系要改成上下叠、左右分窄栏、或者干脆做成时间轴。

| 图型 | 画法 | 什么论断用它 |
|---|---|---|
| 百格网格 | 10×10 格，格 82×62，gap 8；焦点格填朱红 | 比例类：84 个在用 / 33 个敢信 / 3 个常用 |
| 零轴横条 | 竖零轴线，两侧横条，值标签在条末 | 涨跌对照：预测快 24%，实测慢 19% |
| 分叉树 | 源节点在顶，下分岔成两条，各落一张卡 | 一个输入、两种后果（取消 vs 交出去） |
| 泳道三段 | 三段横带（工具 / 交付 / 客户），带内左标签右正文 | 链条类：谁签字、谁担责 |
| 汇流瓶颈 | 三个源盒左上纵排，汇到右侧一节点，下方结论框 | 多因一果、堵点 |
| 能力阶梯 | 四条横条，自上而下加宽，焦点条描朱红 | 层级类：五种能力，谁先谁后 |
| 水平零轴柱 | 轴 y=540、k=13.5、H=884、柱宽 108，三柱带极淡虚线刻度 | 三项指标同轴对比 |
| 时间台阶 | 竖线在左，四个台阶自上而下，末阶焦点框 | 阶段 / 30 天顺序 |

**同型两张必须换形状**：这篇 02 用零轴横条、07 原也用零轴横条被点名「和 02 一样」，改成
水平零轴 + 三柱 + 刻度尺才过；plan 里必须给不同 `variant` 并在形状上真的不一样。

竖版常用坐标（本篇 07 定稿，可直接当模板）：
`H 884 / axis_y 540 / k 13.5 / 柱宽 108 / 中心 208·476·744 / 刻度尺 138→800 / 列头 46·76·112 /
虚线刻度 y=540±135、±270 / 持平段 axis_y±6 / 值标签 cx+68、柱中+14 / 底部说明 832·862`。

## 五、封面：两个平台共用一张

`scripts/cover34.py` 的 `write_cover(fn, ...)`：

```python
write_cover("00-cover.html",
            h1_html='AI 生成变便宜了<br>最稀缺的是<br><span class="l3">验证和负责</span>',
            title="AI 生成变便宜了，最稀缺的是验证和负责",
            eyebrow="洞察 · AI 与产品", count="8 张图解",
            photo=r"assets/portrait.png", alt="人像",
            cap="一句图注：这张照片是什么、什么时候。",
            dek="一句 dek：给已点进来的人。（可空）",
            foot_left="原文｜作者 · 小红书 / 抖音",
            foot_right="1080×1440　封面　两平台共用")
```

版式规矩（照上面第一节的调研来的，不要随手改）：

- 标题三行短句，Noto Serif SC 700 / 97px / 行高 1.1；第三行可落 `.l3` 朱红。每行 ≤6 字。
- 照片满幅 1080×720、`object-fit: cover`，占画面近半——**封面必须有配图**，`photo` 不存在直接报错。
- 照片下沿压 4px 朱红细条，再一行 11.5px 图注（说明照片是谁、哪年），不写摘要。
- 一句 dek（wenkai 20px）贴底，只对已点进来的人说；页脚 12px 左右各一句。
- **不放目录、不放栏目导航、不放「本期讲了什么」**——封面阶段没人读，只会稀释标题。
- 数字在标题里自己写 `<span class="num">`；整串标题不要过 `numspan`（会把 `class="l3"` 里的 3 包进去）。

## 六、截图与门禁

```powershell
python scripts/shot.py out                     # 1080×1440，截 out 下所有 html
python scripts/shot.py out --size 1080x800     # 换成横页
python "$env:DIAGRAM_SKILL_DIR/scripts/verify_geometry.py" (Get-ChildItem out\*.html).FullName
python scripts/verify_clean.py (Get-ChildItem out\*.html).FullName
python scripts/sheet.py                        # FIGKIT_OUT 指向工作目录，拼总览
```

- `shot.py` 按 `--window-size` 固定画幅，页面就是 1080×1440，**3:4 不需要 `trim.py`**（没有多余留白可裁）。
  横页仍要 trim，因为页高是算出来的。
- Chrome 路径先看 `ARTICLE_FIG_CHROME`，再找常见位置与 PATH；找不到直接报错，不静默截半张。
- `--screenshot` 只认绝对路径，脚本内部先 `resolve()`（传相对路径过去会报 `Failed to write file ... 0x3`）。

## 七、踩过的坑（每条都真发生过）

1. **`%PAPER%` / `%SOFT%` 没替换**：整张 SVG 成了亮色纸块，页面看着像被涂了一层。CSS 里每个
   `%XXX%` 都要有对应 token，否则那行声明失效。
2. **`%INK%` / `%MUTED%` 没替换**：声明失效不会掉字，只会静默回落到继承色——正文变纯黑、dek 也变纯黑。
   3:4 首版就是这样，看着「还行」，其实风格没生效。改完页壳要做一次像素回归（见下节）。
3. **`numspan` 包了标签里的数字**：`<span class="l3">` 里的 `3` 被包成数字 span，标题渲染出 `3">…`。
   含标签的字符串不许过它。
4. **照片顶部做渐隐**：黑底人像在纯黑背景上渐变，会渲染出一条灰亮边；要裁就硬切。
5. **02 顶部挤压**：纵页顶部有 mark + h1 + dek，图区起点要留够 44px，别贴着 dek 最后一个字。
6. **03 分岔落卡边**：分岔线 termini 必须落在卡的上边中段，落在角上看着像断线。
7. **05 最上箭头发源在节点外**：汇流竖线起点要落在源盒的下沿里，箭头出节点会被 geometry 判 FAIL。
8. **07 值标签压说明**：柱末标签与底部说明之间至少留 26px，标签按 `cx+68` 起。
9. **08 说明重叠**：两条说明行距 ≥30px，焦点框宽度按 `954 - bx - 20` 收，不然贴边。
10. **同型两张一个样**：02 与 07 都做零轴横条被点名，见第四节。

## 八、像素回归：改了页壳怎么确认没动版式

页壳搬家（从文章目录搬进 skill）时，唯一可信的验收是**像素**，不是「看着一样」。

1. 改之前把 `out/*.png` 的 SHA256 记下来（`Get-FileHash -Algorithm SHA256`）。
2. 改完重跑 make / cover / shot，逐张比对哈希。
3. 哈希不一致时不要猜：用改造前的页壳重排同一页（旧 CSS 字面量 + 旧 `page()`），
   和现在的 HTML 做 `difflib` 文本比对，再用 PIL `ImageChops` 比 PNG，看差异落在哪几行。
   —— 本案的结论就是「差异只在标题与 dek 的着色行，几何 0 变化」，这才是可交付的交代。

顺带一条：颜色 token 修好后，本篇 3:4 的正文由纯黑回到 `#2d3142`、dek 由黑转为 `#4f5d75`，
其余像素与改造前一致。
