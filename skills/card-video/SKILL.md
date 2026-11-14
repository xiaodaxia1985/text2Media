---
name: card-video
description: 卡片视频：把已经做好的卡片组（cards.html）直接做成竖屏视频——每张卡按口播逐卡推进，卡内文字块逐块入场，图里的柱、横条、数字、连线、条目各自长出来。输入是 image-cards / series-reading-cards 产出的 `cards.html` + 一份口播稿 `script.json`，输出 mp4（画幅、卡数、字幕安全位全部按卡片自动适配，9:16 与 3:4 都不用改代码）。Use when the user wants 卡片视频, 卡片转视频, 把卡片做成视频, 图文转视频, 卡片加动画出片, 抖音竖版卡片视频, or "这几张卡片做成一个视频" — 已经有卡片、只想让它动起来并配上口播时用本 skill。**这是出视频的唯一入口**：文章要成片，先出卡片再走本 skill；不走分镜导演路线（那是 explainer-video，两套东西，别混）。
argument-hint: <目录|cards.html> [--script 口播稿] [--probe] [--report] [--out 视频路径]
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
version: "1.0.0"
---

# 卡片视频（card-video）

**卡片 → 视频。** 不重新排版、不重画画面：读 `<主题>-<平台>-<比例>/cards.html`，只在其上叠一层时间，卡里原本的文字块、图、数字就是画面上真正在动的东西。

参数：`$ARGUMENTS`

## 0. 边界：和 explainer-video 严格区分

| | 本 skill（card-video） | explainer-video |
|---|---|---|
| 画面来自 | 已经出好的卡片 | 你现写的分镜（`video.json`） |
| 谁在设计画面 | 卡片（版式已定） | 你（导演，每镜自己搭） |
| 适合 | 卡片已经做完，要一稿多发 | 没有卡片、只想快速出个讲解视频 |

用户说"出视频 / 做成视频 / 出片"时，**先问一句卡片在不在**：在 → 本 skill；不在 → 先出卡片（`image-cards`），再回来。不要默认走 explainer-video。

## 1. 输入

- `cards.html`：`image-cards` / `series-reading-cards` 的产物，同目录应有 `card-01.png …`。画幅从卡片 CSS 自动读（9:16 → 1080×1920，3:4 → 1080×1440），**不要手动传尺寸**。
- `script.json`（口播稿，自己写，放在卡片目录）：
  ```json
  { "cards": [ { "card": 1, "lines": ["开头这一句。"] }, { "card": 2, "lines": ["第二张讲什么。"] } ] }
  ```
  `card` 对应卡片的 `data-card`；`lines` 可以是一句也可以多句，字幕会自动按标点切短语跟读。张数不限——视频张数按内容需要，不受图文的 12–14 张约束。

## 2. 先体检，再配音，最后出片

```bash
# ① 体检：不出片，只列出「每张卡能识别到哪些图原子」
node ${CLAUDE_SKILL_DIR}/scripts/cardvideo.mjs --cards <目录>/cards.html --probe=all --report

# ② 配音（VoxCPM 本地音色，产 narration.wav + alignment.json）
node ${CLAUDE_SKILL_DIR}/scripts/tts.mjs --script <目录>/script.json --work <目录>/video --voice sweet-woman

# ③ 出片
node ${CLAUDE_SKILL_DIR}/scripts/cardvideo.mjs --cards <目录>/cards.html --script <目录>/script.json \
  --work <目录>/video --out <目录>/video/cards-video.mp4
```

- **①的结果是必看项**：某张卡后面是空的（或只挂着 `fig@` 没有原子），说明那张卡的图型没被识别——先看它是不是本来就没图（封面、纯清单、收尾常见），确实该有图就补 `SEL`（见 `scripts/cardvideo.mjs` 顶部注释）。
- **②之前先验动画**：`--probe=3,11,16` 出一段静默验证片（每卡 4.5 秒），确认动画对了再配音，别等渲完 15 分钟才发现某张图没动。
- ③只在配音完成后跑；缺 `alignment.json` 会直接报错，不会静默出无声片。
- **首次配音会慢约 3 分钟**：本机 `import voxcpm` 冷启动实测 233 秒，而引擎探测窗口只有 60 秒，会被误判成"没有 VoxCPM"并静默退到 edge-tts（听感差很多）。`tts.mjs` 已经处理：探测失败 → 自动预热 → 重探；仍然失败就报错停下，**不会悄悄换音色**。想显式用在线音色才加 `--backend edge`。
- 加 `--dry` 可以先看会配几段、每段多少字、本机识别到哪个音色后端，不出声。

## 3. 动画是什么（改之前先看懂）

- **卡内**：顶栏 → 第一块 → 其余块按顺序入场（`ANIM 0.45s`，`translateY 16px → 0` + 淡入），节奏跟着这段口播长度自动分摊。
- **图内五类原子**：`num` 数字滚动（按原文本精度，不乱补小数）、`bar` 横条宽度 0→原值、`col` 柱从基线长高（两根同时长，高度差才有信息）、`draw` 连线描出、`pop` 框与条目弹出。
- **顺序语义**：中心目标（`.cv-tgt`）先立 → 其余逐个 0.14s → 最后画线（线不能先指向空处）。
- **字幕**：按 `，。！？、：；…` 切短语，单行胶囊；位置由卡片底部留白自动算（给抖音 UI 留白的那一版会自动上移）。
- **页脚**：默认隐去每张卡重复的「原文｜作者」（卡顶栏已有），需要时加 `--keep-foot`。

## 4. 交付

- 视频绝对路径、时长、画幅；
- 体检结果一句话：几张卡有图、命中了哪些原子类型、哪几张本来就没图；
- 音色和语速（口播最忌急，语速快就删字，不要加 `atempo`）；
- 需要留意的：卡片本身在原版式里就溢出的（比如某张树图第三列被右边界裁掉），动画救不了，要回 `image-cards` 改卡。
