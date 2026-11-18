# 渲染与包装分离：talkcraft 出画面，我们接声字壳

**这份是硬契约，不是建议。** 画面归它、声音字幕壳归我们，两边只做自己那半段，谁都不改谁的代码。

---

## 一、边界表

| 段 | 谁做 | 产物 | 判据 |
|---|---|---|---|
| 画面 | talkcraft 自己的工程（卡 / motion-systems / 八步管线） | `out/assembled.mp4`（**video-only**） | 帧数 == `composition.durationInFrames` |
| 声音 | 我们（VoxCPM 配音 + `alignment.json` 归一） | `narration.wav`（**整条**） | 时长 == 画面时长（±1 帧） |
| 字幕 | 我们从 `alignment.json` 生成 ASS，ffmpeg 烧 | 硬字幕 | 首字/末字与画面同帧 |
| 壳 | 我们 | 片头尾 / 品牌条 / 三平台转封装 | — |

**一句话**：它只管画面，我们管声、字、壳。

---

## 二、给它什么（四样，缺一不进渲染）

| # | 文件 | 内容 | 谁生成 |
|---|---|---|---|
| 1 | `audio/timestamps.json` | 每句 `{start,end,text}`（talkcraft schema） | 我们，从 `alignment.json` |
| 2 | `semantics.json` | 每句语义标注（26 词封闭表） | `semantic_annotate.py` |
| 3 | `SHOTBOOK.md` | 每镜起止秒 / 意图 / 关系 / **选卡行** | 我们，选卡只从 44 张池取（见 `cards-workflow.md` 二·补） |
| 4 | `shots.json` | `[{"id","start","end"}]`，`end` 为**配音秒数**，非估时 | 我们，从 `timing` 生成 |

**外加一条铁前提**：composition 的 `durationInFrames` 必须等于 `round(配音秒数 × fps)`。
本片：364.0665 s × 30 fps = **10922 帧**。**禁止让 talkcraft 估时长**，估出来的帧数一定跟配音对不上，整条音轨会漂。

配音放它工程的 `public/`（它渲段时 muted，不需要音轨，但放进去方便 `--preview-dir` 单镜试听）。

---

## 三、它产出什么（只取一样）

```
node <talkcraft>/scripts/render_shots.mjs \
  --shots shots.json --comp <main-id> \
  --seg-dir out/segments --parallel 4 \
  --concat out/assembled.mp4
```

- 只给 `--concat`，**不给 `--mux`**（音轨整条由我们压，见第五节红线 1）
- 它自己会做三件事，我们依赖这三件事、不重复做：
  1. 段边界 `Math.round(start*fps)`（与 `Sequence` 同规则）
  2. 每段渲完 `ffprobe` 断言帧数 == 期望，不等 FAIL 退出
  3. concat 后再断言总帧数 == `durationInFrames`

**验收**（我们自己做一次，不信"看起来对了"）：

```powershell
ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 out\assembled.mp4
# 输出必须 == 10922（本片），差 1 帧即停
```

---

## 四、我们怎么接（三条命令，一条合片）

### 1) 音轨
`narration.wav` 已经是整条、已归一（`scale_alignment.py` 跑过），直接压，不再切段。

### 2) 字幕（从 alignment 生成 ASS）

```powershell
python -c "
import json,sys
al=json.load(open(r'video\scripts\voice\alignment.json','utf-8'))['scenes']
talk=json.load(open(r'video\scripts\talk-dankoe-2027.json','utf-8'))['pages']
def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t%60
    return f'{h}:{m:02d}:{s:05.2f}'
out=[]
for sc,pg in zip(al,talk):
    txt=pg['line']
    out.append(f'Dialogue: 0,{ts(sc[\"start\"])},{ts(sc[\"end\"])},Default,,0,0,0,,{txt}')
open(r'video\scripts\voice\subs.ass','w',encoding='utf-8').write(
  '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n'
  '[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n'
  'Style: Default,Noto Sans SC,54,&H00FFFFFF,&H00202020,&H00000000,0,0,0,0,100,100,0,0,1,3,1,2,80,80,90,1\n\n'
  '[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n'
  + '\n'.join(out))
print('subs ok', len(out))
"
```

### 3) 合片（一条）

```powershell
ffmpeg -y -i out\assembled.mp4 -i video\scripts\voice\narration.wav `
  -vf "subtitles=video/scripts/voice/subs.ass" `
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest `
  out\final_<slug>.mp4
```

片头尾用 concat demuxer 或 `filter_complex` 接在这条之后，同样不改画面内容。

---

## 五、红线（破一条就停，不许绕）

1. **不许用 `--mux`**。它渲的段一律 muted；混音若走它，等于让 `AAC` 段头前导延迟去污染整条音轨（它自己纪律 A 写的就是这个）。音轨**整条一次压**。
2. **不许改它的卡、主题、组件、`theme.ts`**。要换色只能走卡暴露的 props（见 `cards-workflow.md` 二·补）；改源码 = 自建版式，本项目已被否三次。
3. **不许让它估时长**。`durationInFrames` 必须从配音秒数算出来。
4. **帧数断言失败就停**。不写补丁脚本抹平，不改段表凑数。
5. **时间轴唯一真相是 `alignment.json`（归一后）**。`shots.json` / `durationInFrames` / `subs.ass` 三者都从它派生，任何一个手改都会错位。

---

## 六、这套接口为什么成立

它原本就是"分段渲染 + 段缓存 + concat + 整条音轨"的母版制，设计目的正是"改一镜只重渲该段"。我们只用它的前半段（画面），把它的后半段（整条音轨 + 交付 loudnorm）换成我们的（解说音轨 + 字幕 + 包装）。两边共用同一个时间轴定义方式（帧边界取整 + 帧数断言），所以拼起来不会漂。

**收益**：单镜返工 = 重渲一段（分钟级），不用整片重来；画面质量由它的卡保证，包装质量由我们保证。
