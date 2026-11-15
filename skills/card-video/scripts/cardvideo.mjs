// cardvideo.mjs — 卡片视频产线（通用版）
//
// 输入：一份卡片 HTML（cards.html，任意主题/任意卡数/任意画幅）+ 一份口播稿 script.json
// 输出：卡内元素逐块入场、图内原子各自运动的竖版视频
//
// 用法：
//   node cardvideo.mjs --cards <cards.html> --script <script.json> --work <workDir> --out <out.mp4>
//   node cardvideo.mjs --cards <cards.html> --probe=3,7,15 --out probe.mp4     # 静默验证片（每卡 4.5s）
//   node cardvideo.mjs --cards <cards.html> --report                            # 只出「每卡图原子」体检报告
//   node cardvideo.mjs --cards <cards.html> --script ... --html-only          # 只产舞台 HTML
//   附加：--keep-foot（保留卡底「原文｜作者」页脚，默认隐去）
//
// 约定：script.json = { "cards": [ { "card": 1, "lines": ["一句口播", "第二句"] }, ... ] }
//       work/voice/narration.wav + work/alignment.json 由 voice.mjs（VoxCPM）生成，
//       alignment.scenes[].{start,end,lines[].chars} 提供逐字时间。
//
// 适配新文章只需要换 cards.html 与 script.json，不用改这里的代码。
// 唯一可能需要补的地方：新主题如果出现「没被下面 SEL 命中」的图型，在 SEL 里加一条选择器，
// 并在 forEach 里给它一个分支（num / bar / col / draw / pop 五类已覆盖绝大多数图表）。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 共享库（浏览器 / ffmpeg / sfx）在 engine/scripts/lib 下，按技能目录相对定位
const ENGINE = path.resolve(HERE, '../../../engine/scripts/lib');
const ARGV = process.argv.slice(2);
const arg = (name, dflt) => {
  for (let i = 0; i < ARGV.length; i++) {
    const a = ARGV[i];
    if (a === '--' + name) {
      const v = ARGV[i + 1];
      return v && !v.startsWith('--') ? v : true;
    }
    if (a.startsWith('--' + name + '=')) return a.slice(name.length + 3);
  }
  return dflt;
};
const CARDS_HTML = arg('cards');
if (!CARDS_HTML) {
  console.error('缺 --cards <cards.html>');
  process.exit(1);
}
const WORK = arg('work', path.dirname(CARDS_HTML));
const OUT = arg('out', path.join(WORK, 'cards-video.mp4'));
const PROBE = arg('probe', null);
const HTML_ONLY = arg('html-only', false);
const REPORT = arg('report', false);
const KEEP_FOOT = arg('keep-foot', false);
const PROBE_DUR = Number(arg('duration', 4.5));
const MIN_PHRASE = Number(arg('min-phrase', 6));
const GAP = 0.10;   // 卡间呼吸
const ANIM = 0.45;  // 单个元素入场时长
const SEL = '.ss-val, .hb-val, .t-val, .hb-bar, .f-acc, .cv-lines path, .arr path, .box, .cmp-col, .cmp li';

const { launchBrowser } = await import(pathToFileURL(path.join(ENGINE, 'chrome.mjs')).href);
const { FFMPEG } = await import(pathToFileURL(path.join(ENGINE, 'video/ffmpeg.mjs')).href);
const { renderSfx } = await import(pathToFileURL(path.join(ENGINE, 'video/sfx.mjs')).href);

const raw = fs.readFileSync(CARDS_HTML, 'utf8');
// 画幅：从卡片 HTML 的 CSS 变量取，取不到按 9:16
const W = Number((raw.match(/--card-w:\s*(\d+)px/) || [])[1] || 540);
const H = Number((raw.match(/--card-h:\s*(\d+)px/) || [])[1] || 960);
const SCALE = 2, FPS = 30;
const allCards = [...new Set([...raw.matchAll(/data-card="(\d+)"/g)].map((m) => Number(m[1])))];

// ── 时间轴 ────────────────────────────────────────────────────────────────
let CUTS, TOTAL, t0 = 0;
let script = null, al = null;
const scriptPath = arg('script');
if (scriptPath) {
  script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  // alignment 由 tts.mjs 写两处（work/ 与 work/voice/），按习惯位置依次找
  const alArg = arg('alignment', null);
  const cands = alArg ? [alArg] : [path.join(WORK, 'alignment.json'), path.join(WORK, 'voice', 'alignment.json')];
  for (const p of cands) if (fs.existsSync(p)) { al = JSON.parse(fs.readFileSync(p, 'utf8')); break; }
}

if (PROBE) {
  const cards = PROBE === true || PROBE === 'all' ? allCards : String(PROBE).split(',').map(Number);
  CUTS = cards.map((card, i) => { const c = { id: 'p' + i, card, t0: t0, t1: t0 + PROBE_DUR, dur: PROBE_DUR, lines: [] }; t0 = c.t1; return c; });
} else {
  if (!script) { console.error('缺 --script（或改用 --probe / --report）'); process.exit(1); }
  if (!al) { console.error('缺 alignment.json：先跑 voice.mjs 配音，或用 --probe 出静默验证片'); process.exit(1); }
  CUTS = al.scenes.map((s, i) => {
    const d = s.end - s.start;
    const c = { id: s.id, card: script.cards[i].card, t0: t0, t1: t0 + d + GAP, dur: d, lines: s.lines };
    t0 = c.t1;
    return c;
  });
}
TOTAL = t0;
const nFrames = Math.round(TOTAL * FPS);

// ── 舞台：只加时间层，不动版式与内容 ──────────────────────────────────────
const extraCss = `
<style id="anim-layer">
.sheet { display: block !important; padding: 0 !important; gap: 0 !important; }
.card { position: absolute !important; left: 0; top: 0; visibility: hidden; will-change: transform, opacity; }
.card.on { visibility: visible; z-index: 10; }
.sub { position: absolute; left: 30px; right: 30px; bottom: 100px; z-index: 40; text-align: center; }
.sub .pill { display: inline-block; max-width: ${W - 60}px; padding: 7px 20px 8px; border-radius: 999px;
       background: rgba(9,12,19,.78); box-shadow: 0 6px 24px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.10);
       font: 600 ${Math.round(W * 0.0352)}px/1.35 'NSSC', 'Noto Sans SC', sans-serif; color: #fff; letter-spacing: .01em;
       opacity: 0; }
.sub .pill.on { opacity: 1; }
</style>
@font-face{font-family:'NSSC';src:url('${pathToFileURL('C:/Windows/Fonts/NotoSansSC-VF.ttf').href}') format('truetype');font-weight:100 900;font-display:block}
`;

const animJs = `
<script id="anim-driver">
window.addEventListener('error', (e) => { window.__ERR = String(e.message || e); });
try {
const boot = async () => {
try { await document.fonts.ready; } catch (e) {}
try { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); } catch (e) {}
window.__CUTS = ${JSON.stringify(CUTS.map(({ id, card, t0, t1, dur, lines }) => ({ id, card, t0, t1, dur, lines })))};
window.__ANIM = ${ANIM};
window.__MINPHRASE = ${MIN_PHRASE};
window.__KEEPFOOT = ${KEEP_FOOT};
const cards = [...document.querySelectorAll('.card')];
const byCard = new Map(cards.map((el) => [Number(el.dataset.card), el]));
// 字幕的安全位：卡底留白（抖音 UI 区）上方一点，不同画幅自动算
const padb = cards.length ? parseFloat(getComputedStyle(cards[0]).paddingBottom) || 0 : 0;
const subBottom = padb > 60 ? Math.max(24, padb - 32) : 24;
const items = new Map();
for (const c of window.__CUTS) {
  const el = byCard.get(c.card);
  if (!el) continue;
  const body = el.querySelector('.c-body');
  const kids = [...body.children];
  const seq = [{ el: el.querySelector('.c-top'), at: 0 }, ...kids.map((k) => ({ el: k, at: 0 }))];
  const foot = el.querySelector('.c-foot');
  if (foot && !window.__KEEPFOOT) foot.style.opacity = '0';
  const head = kids[0];
  const rest = kids.slice(1);
  seq[0].at = 0;
  if (head) seq[1].at = 0.20;
  const span = Math.max(0.9, c.dur * 0.52);
  rest.forEach((k, i) => { seq[2 + i].at = 0.62 + (span / Math.max(1, rest.length)) * i; });
  items.set(c.id, { el, seq: seq.filter((s) => s.el) });
  const figEl = el.querySelector('.c-fig');
  c.figAt = figEl ? (seq.find((s) => s.el === figEl) || { at: 1.2 }).at : 0;
}

// ── 图内原子 ───────────────────────────────────────────────────────────────
// cards.html 的图块默认带 hidden 占位，必须等 __fit() 解除占位后再取元素，否则全抓空。
if (window.__fit) window.__fit();
for (const c of window.__CUTS) {
  const card = byCard.get(c.card);
  const fig = card && card.querySelector('.c-fig');
  c.atoms = [];
  if (!fig) continue;
  const rawHits = [...fig.querySelectorAll('${SEL}')].filter((el) => !el.closest('[hidden]'));
  // 出场语义：中心/目标先立住 → 其余条目逐个 → 最后画线（线不能先指向空处）
  const isPath = (el) => el.tagName.toLowerCase() === 'path';
  const tgt = rawHits.filter((el) => el.classList.contains('cv-tgt'));
  const boxes = rawHits.filter((el) => !isPath(el) && !el.classList.contains('cv-tgt'));
  const paths = rawHits.filter(isPath);
  const nodes = [...tgt, ...boxes, ...paths];
  let bi = 0, pi = 0, colI = 0, liI = 0;
  const colAt = new Map();
  nodes.forEach((el) => {
    const pathNode = isPath(el);
    const tag = el.tagName.toLowerCase();
    const isColEl = el.classList.contains('cmp-col');
    const isLi = tag === 'li';
    let at;
    if (pathNode) at = c.figAt + 0.10 + boxes.length * 0.14 + 0.28 + pi++ * 0.10;
    else if (isColEl) { at = c.figAt + 0.10 + colI++ * 0.14; colAt.set(el, at); }
    else if (isLi) { at = (colAt.get(el.closest('.cmp-col') || null) || c.figAt + 0.24) + 0.30 + liI++ * 0.12; }
    else if (el.classList.contains('f-acc')) at = c.figAt + 0.10;              // 柱：两根一起长，高度差才是信息
    else if (tag === 'text' && el.classList.contains('t-val')) at = c.figAt + 0.18;
    else at = c.figAt + 0.10 + bi++ * 0.14;
    const isNum = el.classList.contains('ss-val') || el.classList.contains('hb-val') || el.classList.contains('t-val');
    const isBar = el.classList.contains('hb-bar');
    const isRectBar = tag === 'rect' && el.classList.contains('f-acc');
    if (isNum && el.childElementCount === 0) {
      const m = el.textContent.match(/^([^\\d]*)(\\d+(?:\\.\\d+)?)(.*)$/);
      if (!m) return;
      c.atoms.push({ kind: 'num', el, at, pre: m[1], val: Number(m[2]), post: m[3], dec: m[2].includes('.') ? m[2].split('.')[1].length : 0 });
      el.textContent = m[1] + '0' + m[3];
    } else if (isBar) {
      const w = el.style.width || getComputedStyle(el).width;
      c.atoms.push({ kind: 'bar', el, at, w });
      el.style.width = '0%';
    } else if (isRectBar) {
      const y0 = Number(el.getAttribute('y')) || 0;
      const h0 = Number(el.getAttribute('height')) || 0;
      if (!h0) return;
      c.atoms.push({ kind: 'col', el, at, y0, h0, base: y0 + h0 });
      el.setAttribute('height', '0');
      el.setAttribute('y', String(y0 + h0));
    } else if (pathNode) {
      const len = el.getTotalLength ? el.getTotalLength() : 0;
      if (!len) return;
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      c.atoms.push({ kind: 'draw', el, at, len });
    } else {
      c.atoms.push({ kind: 'pop', el, at });
      el.style.opacity = '0';
    }
  });
}

// ── 字幕：按标点切短语，只显示当前念到的那一句 ─────────────────────────────
const subs = new Map();
const PUNCT = '，。！？、：；…,';
for (const c of window.__CUTS) {
  const text = c.lines.map((l) => l.text).join('');
  const chars = c.lines.flatMap((l) => l.chars);
  if (!text) { subs.set(c.id, { el: null, pill: null, phrases: [], cur: -1 }); continue; }
  const phrases = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (PUNCT.includes(text[i])) {
      const seg = text.slice(from, i + 1).trim();
      if (seg) phrases.push({ text: seg, at: chars[from] ? chars[from][0] : 0 });
      from = i + 1;
    }
  }
  const tail = text.slice(from).trim();
  if (tail) phrases.push({ text: tail, at: chars[from] ? chars[from][0] : 0 });
  const merged = [];
  for (let i = 0; i < phrases.length; i++) {
    let cur = phrases[i];
    while (cur.text.length < window.__MINPHRASE && i + 1 < phrases.length) { i++; cur = { text: cur.text + phrases[i].text, at: cur.at }; }
    merged.push(cur);
  }
  const div = document.createElement('div');
  div.className = 'sub';
  div.style.bottom = subBottom + 'px';
  const pill = document.createElement('span');
  pill.className = 'pill';
  div.appendChild(pill);
  document.body.appendChild(div);
  subs.set(c.id, { el: div, pill, phrases: merged, cur: -1 });
}
const clamp = (x) => Math.min(1, Math.max(0, x));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
window.__seek = function (t) {
  for (const c of window.__CUTS) {
    const it = items.get(c.id), sb = subs.get(c.id);
    if (!it || !sb) continue;
    const on = t >= c.t0 && t < c.t1;
    it.el.classList.toggle('on', on);
    if (!on) {
      if (sb.el) { sb.el.classList.remove('on'); sb.pill.classList.remove('on'); sb.pill.style.opacity = '0'; }
      sb.cur = -1;
      continue;
    }
    for (const s of it.seq) {
      const p = clamp((t - c.t0 - s.at) / window.__ANIM);
      const e = easeOut(p);
      s.el.style.opacity = e.toFixed(3);
      s.el.style.transform = 'translateY(' + ((1 - e) * 16).toFixed(1) + 'px)';
    }
    const lt = t - c.t0;
    for (const a of c.atoms) {
      if (lt < a.at) { if (a.kind === 'num') a.el.textContent = a.pre + '0' + a.post; continue; }
      if (a.kind === 'num') {
        const p = easeOut(clamp((lt - a.at) / 0.7));
        a.el.textContent = a.pre + (a.val * p).toFixed(a.dec) + a.post;
      } else if (a.kind === 'bar') {
        const p = easeOut(clamp((lt - a.at) / 0.6));
        a.el.style.width = a.w.startsWith('%') ? (parseFloat(a.w) * p).toFixed(2) + '%' : 'calc(' + a.w + ' * ' + p.toFixed(3) + ')';
      } else if (a.kind === 'col') {
        const p = easeOut(clamp((lt - a.at) / 0.62));
        const h = a.h0 * p;
        a.el.setAttribute('height', h.toFixed(1));
        a.el.setAttribute('y', (a.base - h).toFixed(1));
      } else if (a.kind === 'draw') {
        const p = easeOut(clamp((lt - a.at) / 0.5));
        a.el.style.strokeDashoffset = (a.len * (1 - p)).toFixed(1);
      } else {
        const p = easeOut(clamp((lt - a.at) / 0.38));
        a.el.style.opacity = p.toFixed(3);
        a.el.style.transform = 'translateY(' + ((1 - p) * 7).toFixed(1) + 'px)';
      }
    }
    if (!sb.phrases.length) continue;
    let pi = 0;
    for (let i = 0; i < sb.phrases.length; i++) if (lt >= sb.phrases[i].at) pi = i;
    if (pi !== sb.cur) { sb.cur = pi; sb.pill.textContent = sb.phrases[pi].text; }
    sb.pill.classList.add('on');
    sb.pill.style.opacity = (t < c.t1 - 0.1 ? 1 : clamp((c.t1 - t) / 0.1)).toFixed(2);
  }
};
window.__seek(0);
window.__ATOMS = window.__CUTS.map((c) => c.card + ' fig@' + (c.figAt || 0).toFixed(2) + ' | ' + c.atoms.map((a) => a.kind + '@' + a.at.toFixed(2)).join(' '));
window.__READY = true;
};
if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
} catch (e) { window.__ERR = String((e && e.stack) || e); }
</script>
`;

const pagePath = path.join(WORK, 'stage.html');
fs.mkdirSync(WORK, { recursive: true });
const html = raw.replace('</head>', extraCss + '</head>').replace('</body>', animJs + '</body>');
fs.writeFileSync(pagePath, html);
const head = `cards=${path.basename(CARDS_HTML)} ${W}x${H} cuts=${CUTS.length} total=${TOTAL.toFixed(2)}s`;
if (HTML_ONLY) { console.log('html: ' + pagePath + '  ' + head); process.exit(0); }

const browser = await launchBrowser();
const openPage = async () => {
  const pg = await browser.newPage();
  await pg.setViewport(W, H, SCALE);
  await pg.goto(pathToFileURL(pagePath).href);
  await pg.settle();
  for (let i = 0; i < 120; i++) {
    if (await pg.evaluate('!!window.__READY')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const err = await pg.evaluate('window.__ERR || ""');
  if (err) throw new Error('舞台脚本出错：' + err);
  return pg;
};

if (REPORT) {
  const pg = await openPage();
  console.log(head);
  console.log(await pg.evaluate('(window.__ATOMS || []).join("\\n")'));
  await browser.close();
  process.exit(0);
}

const K = Math.min(4, nFrames);
const pages = [];
for (let k = 0; k < K; k++) pages.push(await openPage());

const sfxPath = path.join(WORK, 'sfx.wav');
if (!PROBE) await renderSfx(pages[0], { seconds: TOTAL, whooshes: CUTS.map((c) => c.t0).filter((x) => x > 0), out: sfxPath });

const tStart = Date.now();
const segFiles = [];
await Promise.all(Array.from({ length: K }, async (_, k) => {
  const from = Math.floor((k * nFrames) / K), to = Math.floor(((k + 1) * nFrames) / K);
  const seg = path.join(WORK, `seg-${k}.mp4`);
  segFiles.push({ k, seg });
  const enc = spawn(FFMPEG, ['-hide_banner', '-v', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg],
    { stdio: ['pipe', 'ignore', 'inherit'] });
  const pg = pages[k];
  for (let f = from; f < to; f++) {
    await pg.evaluate(`window.__seek(${(f / FPS).toFixed(4)})`);
    const buf = await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, format: 'png', beyond: false });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  }
  enc.stdin.end();
  await new Promise((r) => enc.on('close', r));
}));
await browser.close();
console.log(`  编码 ${nFrames} 帧 / ${((Date.now() - tStart) / 1000).toFixed(0)}s`);

segFiles.sort((a, b) => a.k - b.k);
const listPath = path.join(WORK, 'segments.txt');
fs.writeFileSync(listPath, segFiles.map((s) => `file '${s.seg.replace(/'/g, "'\\''")}'`).join('\n'));
const silent = path.join(WORK, 'video-silent.mp4');
spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', silent], { stdio: 'inherit' });

if (PROBE) {
  fs.renameSync(silent, OUT);
  for (const s of segFiles) fs.rmSync(s.seg, { force: true });
  console.log('✓ probe ' + TOTAL.toFixed(2) + 's -> ' + OUT);
  process.exit(0);
}

const vo = path.join(WORK, 'voice', 'narration.wav');
if (!fs.existsSync(vo)) { console.error('缺配音：' + vo); process.exit(1); }
const mixPath = path.join(WORK, 'mix.wav');
spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', vo, '-i', sfxPath, '-filter_complex',
  '[1:a]volume=-14dB[s];[0:a][s]amix=inputs=2:normalize=0:duration=first,apad=pad_dur=1[a]',
  '-map', '[a]', '-ar', '48000', '-ac', '2', mixPath], { stdio: 'inherit' });
spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', silent, '-i', mixPath, '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', OUT], { stdio: 'inherit' });
for (const s of segFiles) fs.rmSync(s.seg, { force: true });
console.log('✓ ' + TOTAL.toFixed(2) + 's -> ' + OUT);
