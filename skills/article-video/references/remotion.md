# 元素级动画出片（Remotion）

这一份是「出片」那一段的实现说明。稿子与匹配表在别处，这里只讲**一镜一族怎么落成代码、时点怎么排、整片怎么拼**。

## 一、工程与依赖

```
video/step4-motion/
  src/
    index.ts        registerRoot
    theme.ts        INK / MUTED / ACCENT / PAPER / SANS / SERIF / clampOpts / CAPTION_STYLE
    Root.tsx        每镜一个 Composition
    head.tsx tail.tsx
    v01.tsx … v16.tsx   一族一文件，文件名按**族序号**，不是镜号
  out/              每镜一个 seq-<Id>/element-NNN.png
```

- 依赖：`remotion 4.0.544` / `@remotion/cli 4.0.544` / `react 18.3.1` / `typescript 5.9.3`。
- **工程路径里有中文就必须开一个 ASCII junction**（`E:\t2m-remotion`）。不这么做 webpack 找不到 `node_modules`，报的错跟路径无关，会白查半天。
- 每个 `.tsx` 第一行必须是 `/** @jsxImportSource react */`，否则 JSX 按 classic runtime 编译，Remotion 里直接报 `React is not defined`。

## 二、一个组件的标准骨架

```tsx
/** @jsxImportSource react */
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {INK, MUTED, ACCENT, PAPER, SANS, SERIF, clampOpts, CAPTION_STYLE} from './theme';

export const V07: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const T = (s: number) => s * fps;               // 秒 → 帧
  const tw = (a, b, from = 0, to = 1) =>
    interpolate(frame, [T(a), T(b)], [from, to], clampOpts);

  const inBottom = tw(0.20, 0.60);   // 每个元素一个 0.3–0.5s 的进场
  ...

  return (
    <AbsoluteFill style={{backgroundColor: PAPER, fontFamily: SANS, color: INK}}>
      ...
      <div style={{...CAPTION_STYLE, opacity: tw(0.05, 0.30)}}>整镜那句字幕</div>
    </AbsoluteFill>
  );
};
```

三条约定：

1. **时点一律写秒**（`tw(1.40, 1.80)`），不写帧。换稿、改时长时全组重排，这是代价不是 bug。
2. **字幕整镜一句常驻**（`CAPTION_STYLE`），不参与版式；屏上不再叠提炼大字——那是「一屏三套字」。
3. **进场必须有位移或遮罩**，不能只改 `opacity`。纯淡入就是用户说的「淡入淡出」。

## 三、16 族的元素语法

| 族 | 动什么 | 关键实现 |
|---|---|---|
| A 时间轴横贯 | 主轴先长出来 → 两端锚点落 → 轴上标签依次立 | 轴用 `width` 生长；虚线用 `repeating-linear-gradient` |
| B 反白满版 | 底从下往上擦入 → 橙线从左划到右 → 大字逐字遮罩升起 | 深墨满版 + `clipPath: inset(0 100% 0 0) → inset(0)` |
| C 纵向分栏 | 三条竖线依次落下 → 列标签 → 虚线箭头表示「挪」 | 箭头用 `strokeDasharray` 生长 |
| D 大数字 | 巨数字计数上涨 → 竖排时间标签 → 预测口径标签＋脚注 | 计数用 `interpolate` + `tabular-nums` |
| E 环形 | 环从 12 点描绘一圈 → 环心数字 → 缺口沿径向弹出去 | `<circle>` + `strokeDashoffset`；缺口 `translate` 沿径向 |
| F 斜切 | 斜线生长 → 两侧标签进入 → 中央百分比放大 | `<path>` + `strokeDasharray` |
| G 阶梯落差 | 两块高低先落位 → 落差虚线箭头 → 差值计数 | 两块同底边，高度差＝数据差 |
| H 层叠 | 三张卡落成一摞 → 逐层推开（中 220/100，上 420/200）→ 只留最底一张 | 推开量必须够，否则三层互压 |
| I 路径链 | 线横贯描绘 → 节点依次弹入 → 末端结论数字 | 节点 `scale(0.5→1)`；结论数字最后落 |
| J 点阵计数 | 100 点格 → 点亮计数 → 一部分转灰 | 灰是**变浅**（alpha 降），不是变粉、不是变深 |
| K 推近 | 阵列铺满 → 目标块以画面中心为原点放大 → 其余虚化 | `transformOrigin: center`，倍数 ≤2.8 |
| L 双栏断层 | 两框落位 → 断线两段长出来＋✕ → 责任落到右栏 | 2s 的镜，断线动作压到 0.6s 内 |
| M 大字压版 | 三行大字三种进场（裁出／升起／落下）→ 橙线 → 脚注 | 三行要点各异，不能都用同一招 |
| N 扫描揭示 | 纸块升起 → 光束横扫，同步揭示一行 → 第二遍慢扫揭示第二行 | `clipPath` 宽度跟光束位置绑定 |
| O 比例条 | 竖脊 → 递减条依次长高 → 刻度 → 橙字结论 | 刻度「约 0.1×」这类必须带「约」 |
| P 落章 | 章从 1.6 倍落到 1 → 回弹 1.06 → 墨迹外扩 → 四角定位线 | 0.18s 落下，先落再扩散 |

## 四、时间轴：帧数不是估的

配音出来后，`alignment.json` 里 `scenes` 的时点**不能直接用**。VoxCPM 写完对齐后还会对整条 wav 统一加一次速（实测 ~7.3%），时间戳记的是变速前的，末镜 `end` 会超出 wav 总长。

```powershell
# 先备份，--out 会覆盖输入
python video\scripts\scale_alignment.py video\scripts\voice\alignment.json video\scripts\voice\narration.wav --out video\scripts\voice\alignment.json
# 系数 k = wav 实测 / 末镜 end；逐段按字数核 2.5–6.5 字/秒，有一段落在外就 FAIL
```

分句帧（组件排落位要用）：

```powershell
python video\scripts\seg_times.py video\scripts\voice\alignment.json --fps 30
```

**每镜帧数**：段间有 0.68s 级静默，画面按「到下一句开口才切」处理，

```
帧数_i = (start_{i+1} − start_i) × fps       末镜 = (wav 总长 − start_末) × fps
```

例（16 镜 / 30fps）：01 148 / 02 214 / 03 148 / 04 164 / 05 199 / 06 196 / 07 168 / 08 229 / 09 182 / 10 186 / 11 184 / 12 165 / 13 66 / 14 74 / 15 71 / 16 218 = **2612 帧**。

## 五、渲染与拼接

```powershell
Set-Location "E:\t2m-remotion"; $env:TEMP="E:\t2m-temp"; $env:TMP="E:\t2m-temp"
& ".\node_modules\.bin\remotion.cmd" render src/index.ts V07 "out\seq-V07" --sequence --image-format=png `
  --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

整片（片头 + 16 镜 + 片尾）：

```powershell
python video\step4-motion\join_full.py --audio
# 顺序写死在 SEQUENCE 里，帧数对不上就 FAIL；
# 音频 = 片头 wav（补 0.21s 静音）+ 正文 wav（delay 到片头结束）+ 片尾 wav（delay 到正文结束）+ 尾部补齐
```

## 六、踩过的坑

1. **ffmpeg `apad` 不带参数会无限补静音**：音频永不结束，编码卡死，输出 `moov atom not found`。必须 `apad=pad_dur=N` 配 `-shortest`。
2. **抽帧文件名补零位数不固定**：片头是 `element-00.png`（两位），各镜是三位。硬编码 `element-071.png` 会 FILE_NOT_FOUND；一律按 stem 里的数字排序。
3. **衬线字体里的中文跟数字不同号**：`fontFamily: SERIF` 下「14 处」的「处」会跳成大字。数字和量词拆成两个 div，各给各的字号。
4. **推近超过 3 倍只剩一块色斑**：目标块放大 4 倍以后观众看不出「这是从一个阵列里推出来的」。倍数 ≤2.8，且目标块必须落在画面正中（阵列 5×5、每块 384×216，正中那块的中心就是画面中心）。
5. **`-shortest` 会吃掉末帧**：2821 帧出成 2820。要看末帧完整性就直接数 `nb_frames`。
6. **每个组件渲完抽末帧看一眼**：色阶反了（该灰的成了高亮粉）、数字压字、三层互压，这三类光读代码看不出来，全是看末帧抓到的。
7. **`fitTextOnNLines` 不能写在模块顶层**：字体还没加载，量的是 fallback，反推出的字号偏小、铺不满。必须写在组件内部（组件被渲染时字体已就位）。
8. **按整幅 1640 反推的字号，塞进半幅栏宽会折行**：两栏/三栏镜里，每栏要按**列宽**单独反推（或手算 `列宽 / 字数`），并给 `whiteSpace: 'nowrap'`。拿整幅的字号往半幅放，一定折成两行、压出栏外。
9. **`outline` 不占位、`border` 吃宽度**：Remotion 默认 `box-sizing: border-box`。描边框一律用 `outline`，用 `border` 会让实测宽度和设计宽度差一个边框，`fitText` 的结果就不准了。`clipPath` 进场会切掉 `outline` 描边，描边框的进场改用位移。
10. **`--frames` 只渲一帧时文件名按"最高帧号"补零**：`--frames=147` 出来是 `element-147.png`，`--frames=4` 出来是 `element-04.png`。先 `Get-ChildItem` 列目录再 Read，别硬编码位数。
11. **每镜开头半秒白屏，就是观众嘴里的「跳跃」**：每个组件都从 `chip`（0.10–0.55）起手，第一个大元素 1.3s 才出来，于是每镜开头 0.5–1.3s 画面几乎是空的。整片逐帧扫一遍就能看见（见第 12 条）。改法是把**结构元素**（线、带、框、环）的起始时间提到 0.15–0.25s，`chip` 提到 0 帧，主体提到 0.6s 前后；尾部与长扫动画不动。
12. **整片要过一遍逐帧体检，别只看单镜末帧**：把成片缩到 320×180 抽全帧，算每帧平均亮度 L（<60 判黑影）、与四角背景色差 >12 的像素占比（<1.5% 判近空白）、以及与上一帧的平均像素差（d>40 且不在镜首判硬跳）。三类问题里，「每镜开头空多久」只有这条能查出来。
13. **深底镜头的字幕必须换浅色**：`CAPTION_STYLE` 的墨色是为浅纸底备的，反白满版那一镜直接套用，字幕压成`rgba(244,245,242,0.62)`之后才看得见。凡是背景不是纸色的镜，字幕颜色都要单独给。
14. **片尾配音会覆盖正文配音**：`voice.mjs` 的产物路径不按 script 名分目录，跑片尾那条命令会直接写掉 `voice/narration.wav` 和 `voice/alignment.json`。**跑片尾之前先把两个文件改名存好**（`tail.wav` / `tail.alignment.json`），跑完再把正文那套跑回来（不帶 `--fresh` 会命中 chunks 缓存，音频字节不变）。正文回来之后还要过一遍 `scale_alignment.py` —— `voice.mjs` 的时间轴会超出 wav 实长，不归一会让末镜落在总长之外。
15. **字幕压在字幕区那一行时**：`CAPTION_STYLE` 从底部 62 起，画面上所有元素的下沿都要在 940 以上，否则和字幕叠字。
