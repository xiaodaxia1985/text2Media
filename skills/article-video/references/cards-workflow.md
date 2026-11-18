# 成品版式卡的使用流程（talkcraft `template/cards`）

> 这份是**卡的唯一正确用法**。2026-11-19 已用两次翻车验证：**卡一旦被改造，就不再是卡，而是我自己排的版**。

---

## 一、铁律：卡只填 props，不改外观

| | 允许 | 禁止 |
|---|---|---|
| 文案 | 通过 props 传值（`title` / `items` / `words` / `steps` …） | 改源码里写死的演示文案之外再去调字号、行高 |
| 时间 | 只加 `speed`（乘时间标尺 `t = (frame/FPS) * speed`） | 改 `CONFIG` 里的时序常量、改 `durationInFrames` |
| 布局 | 无 | 删 `<Host>` 人物位、改容器 `left/top/width`、改 `padding/gap`、给条目加 `flex:1`、改列宽 |
| 颜色 | 仅当卡自己暴露 `accent` / `theme` / `itemBg` 这类 props 时传值 | 批量替换色值（`#ffffff`→`#F5F5F5` 之类） |

**判定一句话**：如果这一步改完之后，这张卡与 talkcraft 仓库里同名 demo 的截图**看起来不一样了**，那这一步就是违规的。

---

## 二、三条具体禁令（每条都踩过）

### 1. 不许删 `<Host>` 人物位
卡的构图是「内容 + 人物位」的双栏设计。删掉一侧、另一侧的坐标没动，结果就是内容挤在半边、另半幅全空（2026-11-19 S02 实测）。
**本片没有人像素材时的正解**：换一张**本来就不含 Host 的卡**，不是把 Host 拆掉。

### 2. 不许改配色
108 张卡各有一套自己的纸色与强调色。我自己刷了 117 处色值，等于把 108 张卡改成了「一套我自己画的卡」——这就是用户看到"还是那堆乱七八糟的东西"的根因。
**要统一主题色，只有两条合法路径**：
- (a) 卡暴露了 `accent` / `theme` / `itemBg` / `swatches` 这类 props → 传本片色值；
- (b) 卡没暴露 → **接受卡的原始配色**，或换一张配色本来就接近的卡。
不允许第三种：动手改卡里的色值。

### 3. 不许为了塞文案改造卡
卡没有 `props` 就换卡。把写死常量提成 props 是**允许的一次性改造**（因为不动任何视觉），但改完必须验证"渲染结果与原卡默认渲染一致"（只差文字内容）。

---

## 二·补、卡池必须先做三层过滤（2026-11-19 实测，这是选卡的前置动作）

`template/cards` 有 108 张，但**全量 ≠ 可用池**。按下面三层逐层筛，剩下的才是能进纯图解片的卡：

| 层 | 判据 | 为什么 | 实测 |
|---|---|---|---|
| 1 | 源码里没有 `<Host` | 主持人位是**无条件渲染**的（`<div className="host-wrap"><Host src={hostSrc}/></div>`），不传图就出灰阶剪影、占 42–47%；删它就是改卡 | 108 → **58** |
| 2 | 暴露 `accent` / `itemBg` / `swatches` / `theme` | 否则强调色写死在源码里，传不进项目色 | 58 → **13** |
| 3 | 默认色中性（写死的彩色饱和度低或就是深灰） | 写死品牌蓝/绿 = 违反 D7 主题色统一，且改色即违规 | 放宽合并后 **44** |

**结论**：既能用、又能上项目配色、又不用改卡的池子是 **44 张**（严格可传色的 13 张只是其中一部分）。47 镜用 44 张轮换，每张平均 1.07 次，足够。
再从 44 张里剔除"纯转场/运镜类"（`*-transition`、`slow-push-in`、`tracking-in`、`orbit-drift`、`whip-pan-*` 等，它们是镜头语言不是版式），剩下的才是**内容版式池**。

**两条现成命令**：

```powershell
# 第 1 层：无 Host 的卡
cd tools\video-talkcraft\template\cards
Get-ChildItem *.tsx | Where-Object { (Get-Content $_ -Raw) -notmatch '<Host' } | Select-Object -ExpandProperty BaseName

# 第 2+3 层：纯版面里"能传色 或 默认色中性"的卡（彩色写死且不可传色的会被剔掉）
python -c "
import re,pathlib
for f in sorted(pathlib.Path('.').glob('*.tsx')):
    t=f.read_text(encoding='utf-8')
    if '<Host' in t: continue
    cols=re.findall(r'#[0-9A-Fa-f]{6}',t)
    vivid=lambda c:(lambda r,g,b:max(r,g,b)-min(r,g,b)>40 and max(r,g,b)>60)(int(c[1:3],16),int(c[3:5],16),int(c[5:7],16))
    if not any(vivid(c) for c in cols) or re.search(r'accent|itemBg|swatches|theme\s*[:?]',t):
        print(f.stem)
"
```

**选卡顺序**：先跑上面两条命令拿到池子 → 再按语义从池子里挑 → 挑不到就换候选，**不许回到"改卡"这条路上**（那是本文件第一节的禁令）。

---

## 三、出片流程（十步，卡这一段的正确顺序）

| 步 | 做什么 | 出口条件 |
|---|---|---|
| 1 | 口播稿定稿 | 人点头 + 机器 0 FAIL（审批点） |
| 2 | 逐句标注语义（封闭 26 词表） | 每句有 `primary` / `need` |
| 3 | 按语义查 `references/taxonomy.md` 与 `cards-index.json`，每镜出 3 个候选 | 候选表写清「为什么它合适」 |
| 4 | **选卡只认"原样能用"**：卡的条数、形态必须与这句话匹配；不匹配就换下一张候选 | 每镜 1 卡，且卡不需要改造外观 |
| 5 | 卡内文案填 props | 卡默认值与镜文案一一对应替换，条数不得超过卡的设计条数 |
| 6 | 整卡 960×540 **放大 2 倍**放进 1920×1080 | 卡内坐标一个不动 |
| 7 | 时长适配 | 无 exit 卡 `speed=1`；有 exit 卡 `speed=卡秒/镜秒`；镜/卡 > 1.5 倍换卡 |
| 8 | 出 3–5 张骨架样片 | 甲方说"这个骨架对"（审批点） |
| 9 | 铺全片静帧（每镜 2 帧） | 九项体检 + contact sheet（审批点） |
| 10 | 配音 → 字幕 → 渲染 | 配音必须在画面过审之后 |

---

## 四、验收判据（替代"我觉得好看"）

1. **同名 demo 对照**：每张卡在 `tools/video-talkcraft/demos/<slug>/` 有官方演示。渲出来的帧与它对比——版式、元素位置、配色必须一致，**只有文字不同**。不一致就是卡被改坏了。
2. **抽样复核命令**：
   ```powershell
   # 卡是否被改过外观（除 speed/props 外不应有 diff）
   git -C tools\video-talkcraft diff -- template\cards\<slug>.tsx
   # 工程内的卡与仓库原卡比对
   fc.exe tools\video-talkcraft\template\cards\<slug>.tsx video\<工程>\remotion\src\cards\<slug>.tsx
   ```
3. **一个硬指标**：工程内 `src/cards/` 下每个文件与仓库原卡相比，**只允许出现** `speed` 参数、`props` 默认值两类差异。出现 `Host` 被删、色值被换、`left/right/padding` 被改 = 违规，必须从仓库重新拷。

---

## 五、本篇已造成的违规记录（回滚清单）

以下改动**全部作废，须从 `tools/video-talkcraft/template/cards/` 重新拷回**：

| 卡 | 我改了什么 | 状态 |
|---|---|---|
| 6 张主力卡 | 删 `<Host>` | 须回滚 |
| 6 张 | 重排容器坐标（`.data-panel left:47%→0`、`.stack right→left:237`、`.tl-wrap 132→270`） | 须回滚 |
| 18 张 | 117 处色值替换 | 须回滚 |
| `title-demote-to-label` | 条目 `flex:1` 撑满 | 须回滚 |
| `chapter-title-card` | `DEMO_THEMES` 改浅底深字 | 须回滚 |
| 4 张 | 文案提成 props（无视觉影响） | **可保留** |
| 18 张 | 加 `speed`（只乘时间标尺，无视觉影响） | **可保留** |
