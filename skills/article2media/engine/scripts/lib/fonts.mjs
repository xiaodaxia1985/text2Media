// Local web fonts for every render page, so a render does not depend on the network or on what the
// machine happens to have installed.
//
//   西文（Inter）：engine/assets/fonts/inter-variable.woff2，完整 Latin 字符集的变量字体（100–900 字重），
//                以 data URI 内嵌。没装 Inter 的机器也能出同一套字形。
//   中文（Noto Sans SC）：**不内嵌**。站点那份 245 KB 的 woff2 只是「站点实际用到的字」子集，缺字会回落到
//                微软雅黑，一格字里混三种字体（实测 .cv-title 出现 Noto Sans SC + Inter + YaHei）。中文交给
//                系统里的全量 Noto Sans SC（本机已装 NotoSansSC-VF.ttf，17 MB，100–900 全覆盖）。机器上没装时
//                整块回落到 PingFang / 微软雅黑，是统一回落，不会混排。
//
// 字体文件缺失时安静跳过 —— 字体族会落到主题字体栈里的下一项（老行为），不是报错。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS_DIR = path.join(ENGINE, 'assets', 'fonts');

const FACES = [
  { family: 'Inter', file: 'inter-variable.woff2' },
];

let cached = null;

export function fontsCss() {
  if (cached !== null) return cached;
  const parts = [];
  for (const f of FACES) {
    let buf;
    try { buf = fs.readFileSync(path.join(FONTS_DIR, f.file)); } catch { continue; }
    parts.push(
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:100 900;` +
      `font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`,
    );
  }
  cached = parts.join('\n');
  return cached;
}

/** `<style>` tag for the font faces, ready to drop into a page head. */
export const fontsStyle = () => `<style>${fontsCss()}</style>`;
