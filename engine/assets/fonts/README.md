# 引擎字体（engine/assets/fonts）

2026-11-10 加进来的本地字体，让卡片 / 长图 / 公众号封面 / 视频封面的字形不再取决于这台机器装了什么、也不取决于能不能连上 Google Fonts。

| 文件 | 体积 | 用途 |
|---|---:|---|
| `inter-variable.woff2` | 344 KB | Inter 变量字体，完整 Latin 字符集，100–900 字重。来自 npm `inter-ui@4.1.1`（`variable/InterVariable.woff2`） |
| `fonts.css` | 0.4 KB | 上面这一份的 `@font-face`，给独立 HTML 用 |

**中文没有进这个目录。** 原因：站点 `public/fonts/noto-sans-sc.woff2` 只有 245 KB，是"站点实际用到的字"的子集；拿它冒充全量思源黑体，缺字的地方会掉到微软雅黑，同一行里混三种字形（实测一张卡片的标题同时命中 `Noto Sans SC` + `Inter` + `Microsoft YaHei`）。中文改用系统里的全量 Noto Sans SC（本机已装 `C:\Windows\Fonts\NotoSansSC-VF.ttf`，17 MB，100–900）。机器上没装时整块回落到 PingFang / 微软雅黑，是统一回落，不混排。

## 引擎怎么用

`scripts/lib/fonts.mjs` 把 `inter-variable.woff2` 读成 base64，拼成 `@font-face` 塞进每个渲染页的 `<style>`：

- `layout-card.mjs`（卡片）
- `layout-long.mjs`（长图）
- `layout-full.mjs`（原文长图）
- `layout-cards-article.mjs`（原文卡片）
- `layout-whiteboard.mjs`（白板）
- `layout-comic.mjs`（漫画，两种页）
- `layout-wechat.mjs` / `layout-wechat-article.mjs`（公众号源页与封面）
- `video/render.mjs`（视频舞台页）

同时把三套 `apple-hark*` 主题里指向 `fonts.googleapis.com` 的 `@import` 删了——不再从网络拉字体，离线也能出同一套字。`themes/legacy/` 里那 18 套旧主题仍带各自的 `@import`（它们要的字体这里没有，保持原样）。

代价：每个渲染页的 HTML 会多约 460 KB（base64）。卡片一页一张，10 张就是 4 MB 临时文件，可接受。

## 字体已经装进系统了（2026-11-10）

Inter 现在也是这台机器的系统字体，不写 `@font-face` 也能用：

| 项目 | 值 |
|---|---|
| 文件 | `%LOCALAPPDATA%\Microsoft\Windows\Fonts\Inter-{Regular,Medium,SemiBold,Bold,ExtraBold}.ttf` |
| 注册表 | `HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts` 下五条 `Inter <Style> (TrueType)` |
| 家族名 | `Inter`（不是 `Inter Variable`——原名在 Windows 上只暴露成 `Inter Text`，`font-family:'Inter'` 匹配不到，所以装之前改过 `name` 表） |

怎么来的：Google Fonts 只给 woff（`77 4f 46 46`），Windows 装不了；npm 的 `inter-ui@4.1.1` 给的是 woff2。用 fontTools 把 `inter-variable.woff2` 拆成 5 个静态字重再改名安装（`fonttools 4.68.0 + brotli`，pip 走阿里云镜像装的）。

验证：GDI 字体枚举里 `Inter` 出现；Chrome 里一个没有 `@font-face` 的页面写 `font-family:'Inter'`，`CSS.getPlatformFontsForNode` 报 `Inter:22`。

**中文系统字体**：`C:\Windows\Fonts\NotoSansSC-VF.ttf`（17 MB，100–900），注册项 `Noto Sans SC (TrueType)`，本来就有，没动。

## 想换字体 / 加中文字体

- 换西文：把新的 woff2 覆盖 `inter-variable.woff2`，或在 `fonts.mjs` 的 `FACES` 里加一条。
- 加内嵌中文：需要**全量**思源黑体 woff2（10 MB 级），子集不能用。或者干脆把字体装到系统，删掉内嵌那条。
