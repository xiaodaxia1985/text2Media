# 示例：一篇文章 → 10 张图解页

这是 `article-figures` 的第一个完整样例，也是「张数由结构算」这条规则的证据：原文 26 个语义块、15 张可画、落成 10 页，逐页块级覆盖 `0 fail 0 warn`。

| 文件 | 是什么 |
|---|---|
| `plan/huang.md` | 原文落成 42 行（31 段，段落落在奇数行），块表的行号指的就是这个文件 |
| `plan/huang-blocks.json` | 26 个块的切分表：`claim` / `figure` / `why` / `grp` / `anchor`（逐字原句） |
| `plan/huang.plan.json` | 10 页的 plan：`pages`（每页接哪几块）＋ `article_map`（7 行自拟节名，全部标 `derived`）＋ `figures` |
| `make.py` | 这一篇的十个图型函数，页面壳从 skill 里 import，不复制样式 |
| `figures-sheet.png` | 十页拼成的总览（3×4），人眼复核用 |

`out/` 是渲染产物，已在 `.gitignore` 里，不入库。

## 跑一遍

```powershell
$env:FIGKIT_FONTS = "<你的字体目录>\fonts-src"   # 160MB 字体包，走 skill 的 fetch_fonts.ps1 下
python ..\..\skills\article-figures\scripts\plan_check.py plan\huang.plan.json plan\huang.md
python make.py                                   # 出 10 页 HTML 到 out/
```

`make.py` 自己找 skill 的 `scripts` 目录（先看 `ARTICLE_FIGURES_DIR`，再从仓库根按 `skills/article-figures/scripts` 找），所以不用改路径。

出图后的三步门禁见 `skills/article-figures/SKILL.md` 第五节：截图 → `trim.py` 裁白 → `verify_geometry.py` / `verify_clean.py` → `sheet.py`。

## 这一篇的数字

```
COVER  blocks 26 · 可画 15 · 接住 15 · 漏 0 · 不画已交代 11 · 页 10 · 按每页 3 块的下限 5 页 · 断言组 10
0 fail, 0 warn
```

- 张数不是按字数给的：26 块里 11 块写清了「为什么不画」（判断句、过渡句、已在别的页当图注的），剩下 15 块按断言组归并成 10 页。
- 每页 ≤3 块是硬约束。这篇最低可以压到 5 页，但压下去就是「一页代替多页」——正是 6 页版被判定「没讲透」的原因。
- 原文没有任何小标题，`article_map` 里 7 个节名是 AI 自拟的，全部标了 `derived`，不冒充原文。

## 两处刻意的「不精确」

- 04（现金流）与 06（生活配置）的条长是**定性示意**：原文只给了「三十天」「裁掉七成」「上亿美元」「数千万美元」，没有金额序列。图上与页脚都写了这句，不拿假刻度充数。
- 07（反差）的「八个数量级」是作者按 8 元 / 1 亿美元换算的，原文没做这个比较，页脚标注了「原文未作此比较」。

## 出处

原文为今日头条公开报道《深挖才看懂，卸任英伟达的黄仁勋，千亿身家背后的真实生活有多壕》。`plan/huang.md` 只作为覆盖校验的本地样本保留（`anchor` 要逐字命中原文，行号要对得上）；仓库若要转公开，先把它删掉或换成你有权分发的内容。
