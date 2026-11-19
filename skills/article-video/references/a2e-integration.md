# a2e 接入（已落地实况 · 2026-11-19）

本文记录**已经做掉的事实**，不是方案讨论。上一版（v1/v2/v3 讨论稿）已作废，勿引用。

## 一句话

`engine/src/a2e/` 里是 anything2explainer（a2e）的**原样代码**；只把画布尺寸抽成常量、把配色抽成 theme token 两层，图元算法一行未改。换系列只换一份 token 文件。

## 落地清单

```
engine/src/a2e/
  ui.tsx fx.tsx config.ts common/     ← 上游原样（见 VENDOR.md 指纹）
  canvas.ts                           ← 新增接入层：CANVAS = 1080×1920
  theme/{types,dk-paper,dark-tech,index}.ts   ← 新增主题层
```

对上游的改动只有三处，全部记在 `a2e/VENDOR.md`：

1. `canvas.ts` 新增（上游 1280×720 → 本项目 1080×1920）
2. `common/lib.tsx` 的 `W/H/FPS` 改为读 `CANVAS`
3. `ui.tsx` 两处 `Svg` 的 `width/height/viewBox` 改为读 `CANVAS`

**没有做的事**（上一版讨论稿里的错误方向，别再走）：
- 没有给 90 个图元各写一个 `kit` 包装器（那是新的自造层）
- 没有 patch `ui.tsx` 里 26 处硬编码深色底（那些是 props 默认值，调用时传 token 即可；纸色下用不到的图标先不用）
- 没有 fork 一份 `ui.tsx` 每个系列改一遍

## 怎么用

```tsx
/** @jsxImportSource react */
import {Box, CText, Svg, LineArrow, Check, Cross, Pill} from '../../a2e/ui';
import {THEME as T} from '../../a2e/theme';
import {powOutRemain, clamp01} from '../../a2e/common';

<Box x={96} y={1180} w={380} h={140} fill={T.card} stroke={T.hair} sw={1} />
<CText cx={540} cy={400} size={78} color={T.ink}>标题</CText>
<Svg bloom={false}>
  <LineArrow x0={580} y0={1250} x1={700} y1={1250} p={0.6} rodW={4} color={T.ink} />
</Svg>
```

换主题：`a2e/theme/index.ts` 里 `export const THEME = dkPaper` 改一行。

## 接线四条（实测得出，必须遵守）

1. **`Check` / `Cross` / `LineArrow` 等是 SVG 元素，必须放进 `<Svg>`**。直接挂在 `AbsoluteFill` 下什么都不显示（首版探针就踩了这条）。
2. **`Box` 里的 `CText` 要用盒内局部坐标**。`CText` 是 `position:absolute`，会相对最近的定位祖先（也就是 Box）定位，传画布坐标会飞出盒子。
3. **`CText` 的 `(cx, cy)` 是墨迹中心**，`Box` 的 `(x, y)` 是左上角——两套语义别混。
4. **柱身宽度按画幅给**。a2e 示例（`examples/rag/.../G1/SC05.tsx`）是 16:9、柱宽 100+；竖版 1080 宽上沿用细线会读成「一根线」。本项目竖版柱宽取 **120**。

## 图元能干什么（按语义查，不按名字猜）

| 要画的关系 | 用什么 |
|---|---|
| 箭头 / 指向 / 汇流 | `LineArrow`（杆先长、三角头贴当前尖端，`p` 0→1）、`ArrowH`（水平 div 版） |
| 对 / 错、能 / 不能 | `Check`、`Cross`（`strokeDasharray` 做 draw-on） |
| 卡 / 胶囊 / 标签块 | `Box`、`Pill`、`TagBlock` |
| 数值 / 大字 / 等宽 | `CText`、`Counter`、`MonoText`、`TechText` |
| 柱图 | **没有现成 Bar**。按示例画法：基线一根线 + 每根柱一条 rect 按 `h×(1−powOutRemain(n,16,2.5))` 生长 + 数值挂柱顶 + 每根错峰 2 帧 |
| 环 / 仪表 | `Gauge` |
| 时间轴分段 | `TimelineBar` |
| 网格点亮 | `ClusterGrid` |
| 图标（文档/数据库/模型/机架/人/代码卡/仓库卡） | `DocIcon`、`DBIcon`、`LLMIcon`、`RackIcon`、`PersonIcon`、`CodeCard`、`RepoCard`（内部有写死深底，纸色下先不用） |

## 验收口径（已通过）

- `tsc --noEmit` = 0
- 同一探针组件出两张图：`ProbePaper`（dk-paper）+ `ProbeDark`（dark-tech），画面除配色外完全一致 → 证明「换主题零改动」
- 产物：`engine/out/probe/probe-paper.png`、`probe-dark.png`
- 探针文件：`engine/src/pieces/probe/ThemeProbe.tsx`（**验收完即删，不是正片镜头**）

## 还没验的

- `fx.tsx`（16:9 深底光效 / 运镜）在竖版下的可用性——本系列不用，待用再验
- `common/` 里 `Fonts` 组件：会 `delayRender` 等 `Exo 2 / Orbitron / Audiowide` 字体文件，**字体未就位前不要挂**，否则渲染会卡在等字体
- 纸色下内部写死深底的图标（`LLMIcon` / `GPUChip` / `RepoCard` / `PersonIcon`）
