// 把真实人物照片放进插画缓存槽（引擎禁止生成真人，真图只能从缓存槽喂）
//
// 用法：
//   node scripts/seed-cover-photo.mjs --dir <内容目录> --photo <照片路径> [--files a.json,b.json]
//
// 缓存 key = keyFor(prompt, style, aspect, kind)，其中 style 来自 content.theme，
// 所以同一篇文章用不同主题出图，key 不同，需要各存一份。
// 目标文件：<内容目录>/illustrations/<key>.<照片扩展名>
import fs from 'node:fs';
import path from 'node:path';
import { themeStyle, keyFor } from '../skills/article2media/engine/scripts/lib/illustrations.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};

const dir = arg('dir');
const photo = arg('photo');
if (!dir || !photo) {
  console.error('用法：node scripts/seed-cover-photo.mjs --dir <内容目录> --photo <照片路径> [--files a.json,b.json]');
  process.exit(2);
}
if (!fs.existsSync(photo)) {
  console.error(`照片不存在：${photo}`);
  process.exit(2);
}

const files = (arg('files') || fs.readdirSync(dir).filter(f => /^content.*\.json$/.test(f)).join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

const ext = path.extname(photo).toLowerCase();
fs.mkdirSync(path.join(dir, 'illustrations'), { recursive: true });

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`  跳过 ${f}（不存在）`); continue; }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ill = c.cover?.illustration;
  if (!ill) { console.log(`  跳过 ${f}（封面没有 illustration）`); continue; }
  const theme = typeof c.theme === 'string' ? c.theme : c.theme?.cards;
  const key = keyFor({ prompt: ill.prompt, aspect: ill.aspect, kind: 'cover' }, themeStyle(theme));
  const out = path.join(dir, 'illustrations', key + ext);
  fs.copyFileSync(photo, out);
  console.log(`  ${f}  theme=${theme}  →  illustrations/${key}${ext}`);
}
console.log('完成。重跑 cards.mjs 即会读到照片，不会触发生成。');
