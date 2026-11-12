# skills 索引（article2media\skills）

这里是**本项目唯一的能力来源**：13 个 skill 全部在这一层，没有第二份副本。
脚本入口固定在 `skills\<能力>\scripts\` 下，**相对路径按当前 cwd 解析**，所以调用时用
`node article2media/skills/<能力>/scripts/<入口>.mjs` 这种从项目根出发的写法，别把目录搬来搬去 —— 搬了脚本就找不到自己的 assets / layouts / themes。

| skill | 干什么 | 什么时候用 |
|---|---|---|
| `article2media` | 总入口。把 10 个能力按推荐组合串起来（抓取→改写→长图 / 卡片 / 公众号 / 口播视频 / 白板 / 漫画），也可以一稿多发 | 给一篇文章、链接或视频，要成图的整套流程；不指定就说"做成图 / 小红书 / 公众号 / 视频" |
| `article-fetch` | 抓取：X 长文与线程、网页、公众号、本地 md/txt/html → 干净的 `article.md` | 第一步取原文；也可单独"把这篇文章存成 markdown" |
| `video-transcript` | 视频转文字：抖音 / YouTube / B 站链接、本地视频音频、srt/vtt → 带时间轴的逐字稿 | "视频转文字 / 逐字稿 / 提取字幕 / 视频文案" |
| `article-rewrite` | 改写（总结）：读透原文 → 结构化改写稿 `content.json`（主张、分页分节、判断式标题、要点、金句、图表、数据面板），可导出 `rewrite.md` | 要"总结 / 提炼 / 整理成要点"，或给长图、卡片准备内容 |
| `article-translate` | 全文翻译：外文 → `article.zh.md`，不删减不改写，块数与结构逐块对齐校验 | "翻译这篇 / 全文翻译 / 搬运外文文章" |
| `long-image` | 长图：`content.json` → 1–4 张杂志长图；`article.md` → 一字不改的原文长图 | "长图 / 总结图 / 原文长图 / 一字不改 / 换个主题重出" |
| `image-cards` | 卡片：小红书 3:4、IG 4:5、方图 1:1、竖屏 9:16，附总览图与发帖文案；支持原文卡片（整篇分页、一字不改） | "小红书图文 / 轮播卡片 / 知识卡片 / 朋友圈方图" |
| `wechat-layout` | 公众号排版：内联样式、图片内嵌、7 套主题、2.35:1 头图 + 1:1 封面 + 发布信息，正文逐块校验 | "排成公众号 / 推文排版 / mp.weixin" |
| `explainer-video` | 口播视频：1080×1920 竖屏讲解，分镜脚本 `video.json`、配音、逐字对齐、动画、字幕、封面、混音、自动审片 | "口播视频 / 短视频 / 讲解视频 / 文字转视频" |
| `logic-whiteboard` | 白板论证：把推理摊成一条纵向主干的长图，问题在前、证据往下，配论证账本与来源清单 | "白板 / 论证图 / 把这篇的逻辑画出来" |
| `article-comic` | 漫画：黑白分镜，你写认知拍点与固定角色，出图负责角色场景，HTML 负责旁白对白（图里不画字）；出长漫画 + 小红书 3:4 卡片 | "漫画 / 连环画 / 四格 / 分镜"（需出图能力） |
| `x-article-skill` | 写作：按个人语料、参考材料与视觉风格，产中文 X Article 长文内容包（标题、正文、配图、封面、导流短文），支持单项改 | **写稿这一端**，上游产物交给 `article2media` 出各渠道成品 |
| `lieflat-less-ai-tone` | 去 AI 味：脚本层（`scripts/detect.py` 数标点/句长/结构）+ 语义层（按 `references/semantic-criteria.md` 判读）+ 人审层；先交带研究参照、例句和改法的改前报告，用户确认后按最小改动改写，`scripts/report.py` 复测出前后对比 | **成稿清洗这一端**：明知是 AI 写/改出来的稿子，要收拾得像人写的；也适合发稿前自查 |

## 三条使用约定

1. **写作用 `x-article-skill`，出稿用 `article2media`。** 前者产文章内容包，后者把文章变成卡片 / 长图 / 公众号 / 视频。两套能力现在在同一棵目录树里，中间靠 `article.md` 与 `content.json` 交接。
2. **定稿前去 `lieflat-less-ai-tone` 洗一遍。** 它是独立的一站，读 `article.md` 或任何成稿，先出检测报告，等你回「按建议改」才动笔；改完的稿子再交给 `article2media` / `x-article-skill`。它只做局部清理，不改标题、结构、信息点。
3. **产物只落 `..\..\output\<日期>\`。** 引擎资源（`themes/`、`layouts/`、`assets/voices/`、`assets/fonts/`）在仓库里，成品不要写回仓库。

## 变更记录

- 2026-11-11：`lieflat-less-ai-tone` 从 GitHub（`larashero3-dotcom/lieflat-less-ai-tone`，main 分支）整仓并入本目录，与 12 个能力并成同一层；文件按 git blob SHA 逐个校验，未做任何改写。
- 2026-11-10：`x-article-skill` 从项目根 `skill\x-article-skill` 移入本目录，与 11 个工具自带能力合并成同一层；原 `skill\` 目录已移除。
