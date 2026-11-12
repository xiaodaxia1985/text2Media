// 交付前核对：卡文件 / caption 数字 / 总览图时效 / 结尾条目 / 标题长度
// 用法：node verify_delivery.mjs --content content-小红书.json --dir apple-hark-小红书-3x4 --platform 小红书
import fs from 'node:fs';
import path from 'node:path';

const PLATFORM_MAX = { '小红书': 18, '抖音': 30, '微信': 9, 'X': 4 };

const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};

const contentPath = path.resolve(arg('content'));
const dir = path.resolve(arg('dir'));
const platform = arg('platform');

const fails = [];
const warns = [];
const ok = m => console.log('  ✓ ' + m);
const bad = m => { fails.push(m); console.log('  ✗ ' + m); };
const warn = m => { warns.push(m); console.log('  ! ' + m); };

console.log(`核对 ${platform} · ${dir}`);

if (!platform || !(platform in PLATFORM_MAX)) {
  bad(`--platform 必须是 ${Object.keys(PLATFORM_MAX).join(' / ')}`);
}

// 1. 卡文件连续
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /^card-\d+\.png$/.test(f))
  : [];
const n = files.length;
if (!n) bad('产物目录里没有 card-*.png');
files.sort();
for (let i = 1; i <= n; i++) {
  if (!files.includes(`card-${String(i).padStart(2, '0')}.png`)) bad(`缺 card-${String(i).padStart(2, '0')}.png`);
}
if (n && platform in PLATFORM_MAX) {
  const max = PLATFORM_MAX[platform];
  if (n > max) bad(`${platform} 上限 ${max} 张，实际 ${n} 张`);
  else ok(`张数 ${n} ≤ ${platform} 上限 ${max}`);
}

// 2. content 主题 + 模式判定（A 纯精读 / B 精读 + 判断）
let content = null;
let hasJudge = false;
try {
  content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const theme = typeof content.theme === 'string' ? content.theme : content.theme?.cards;
  if (!theme) bad('content.json 没写 theme');
  else ok(`主题 ${theme}`);

  const JUDGE_LABELS = ['转折', '补三层', '我的进度', '01 条件', '02 机会', '03 最小产品'];
  hasJudge = (content.pages || []).some(p =>
    /判断|原文到这里结束/.test(p.intro || '') ||
    (p.sections || []).some(s => JUDGE_LABELS.some(l => String(s.label || '').startsWith(l)))
  );
  ok(`模式 ${hasJudge ? 'B（精读 + 判断）' : 'A（纯精读）'}`);
} catch (e) {
  bad(`content.json 读不动：${e.message}`);
}

// 3. caption：裸数字 / 区间自洽 / 总张数
const capPath = path.join(dir, 'caption.md');
if (!fs.existsSync(capPath)) bad('没有 caption.md');
else {
  const cap = fs.readFileSync(capPath, 'utf8');

  if (/前\s*\d+\s*张/.test(cap)) {
    bad('caption 里有「前 N 张」这种不带卡号的裸数字：卡号区间要写死，否则改版必踩空');
  }

  const rng = cap.match(/第\s*(\d+)\s*[–—~-]\s*(\d+)\s*张（共\s*(\d+)\s*张）/);
  if (!rng) warn('caption 没写「第 A–B 张（共 N 张）」区间，无法自动核对原文段范围');
  else {
    const [a, b, c] = [Number(rng[1]), Number(rng[2]), Number(rng[3])];
    if (b - a + 1 !== c) bad(`区间 ${a}–${b} 与「共 ${c} 张」对不上`);
    else if (b >= n) bad(`原文段到第 ${b} 张，但全组只有 ${n} 张`);
    else ok(`原文段 第 ${a}–${b} 张 = ${c} 张`);

    const after = cap.match(/后面\s*(\d+)\s*张/);
    if (hasJudge) {
      const expect = n - 2 - c;
      if (expect < 3) bad(`按结构判断段只有 ${expect} 张，B 模式至少 3 张`);
      else if (!after) bad(`B 模式文案必须写「后面 ${expect} 张是判断」，否则读者不知道哪几张是我们的观点`);
      else if (Number(after[1]) !== expect) bad(`「后面 ${after[1]} 张」与结构不符：${n} 张 = 封面 1 + 原文 ${c} + 判断 ${expect} + 要点 1`);
      else ok(`判断段 ${after[1]} 张，与本组结构自洽`);
    } else {
      if (n !== 2 + c) bad(`A 模式应为 封面 1 + 原文 ${c} + 要点 1 = ${2 + c} 张，实际 ${n} 张`);
      else ok(`A 模式结构自洽：1 + ${c} + 1 = ${n} 张`);
      if (/我们的判断|我的判断|我的看法|补的这三层|我们的观点/.test(cap)) {
        bad('A 模式（纯精读）的文案里出现了「判断 / 我的看法」，素材里没有观点就不该在文案里承诺观点');
      }
      if (after) warn(`A 模式文案写了「后面 ${after[1]} 张」，确认是否误把原文段当判断段`);
    }
  }

  const last = cap.match(/card-01\.png[^\d]*card-(\d+)\.png/);
  if (!last) warn('caption 末尾没有「card-01.png … card-N.png」上传顺序行');
  else if (Number(last[1]) !== n) bad(`caption 写上传到 card-${last[1]}，实际 ${n} 张`);
  else ok(`上传顺序行与 ${n} 张一致`);

  if (platform === '小红书' || platform === '抖音') {
    const t = (cap.match(/# 标题\s*\n+\s*(.+)/) || [])[1]?.trim() || '';
    if (!t) bad('caption 缺标题');
    else if ([...t].length > 20) bad(`标题 ${[...t].length} 字符 > 20（平台上限）`);
    else ok(`标题 ${[...t].length} 字符 ≤ 20`);
  }
}

// 4. 总览图与画框预演比最后一张卡新
for (const f of ['overview.jpg', 'frame-check.png']) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { bad(`缺 ${f}`); continue; }
  const lastCard = `card-${String(n).padStart(2, '0')}.png`;
  const lu = fs.statSync(path.join(dir, lastCard)).mtimeMs;
  const fu = fs.statSync(p).mtimeMs;
  if (fu + 1000 < lu) bad(`${f} 比 ${lastCard} 旧，说明是上一轮留下的`);
  else ok(`${f} 与最新一轮同步`);
}

// 5. 结尾 takeaway 偶数、≤16
if (content) {
  let tk = 0;
  for (const pg of content.pages || []) for (const s of pg.sections || []) if (s.takeaway) tk++;
  if (tk % 2 !== 0) bad(`结尾卡 ${tk} 条 takeaway 是奇数，两栏对不齐`);
  else if (tk > 16) bad(`结尾卡 ${tk} 条 > 16，会挤到收字号`);
  else ok(`结尾卡 ${tk} 条，${tk / 2}+${tk / 2} 可逐行对齐`);
}

console.log('');
if (fails.length) {
  console.log(`核对未通过：${fails.length} 项 ✗，${warns.length} 项 !`);
  process.exit(1);
}
console.log(`核对通过：0 项 ✗，${warns.length} 项 !`);
