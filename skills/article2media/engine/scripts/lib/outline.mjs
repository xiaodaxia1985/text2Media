// L0：原文 → outline.json。
// 只做"规则判得出来"的活：把文章切块，抓判断句（主张）、认出证据形态、给每条记原文 span。
// 不调用模型，也不改写一个字——它只是把原文的结构摊开，交给下一步决定每页讲什么。
// 形态口径与 role-map.mjs 对齐（none / compare / list / step / number / quote / image）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const plain = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*?|__?|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripFrontMatter = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

/** 判断句的强标记：命中一个，这句就可能是这一节的"主张"。 */
const CLAIM_PATTERNS = [
  { re: /不是[^，。]{1,20}[，,]\s*(?:而)?是/, name: '不是…而是…' },
  { re: /不等于/, name: '不等于' },
  { re: /真正(?:的|问题|难点)?/, name: '真正的…' },
  { re: /问题不在.{0,20}而?在/, name: '问题不在…而在…' },
  { re: /与其.{0,20}不如/, name: '与其…不如' },
  { re: /只有.{0,20}才/, name: '只有…才' },
  { re: /必须|只能|才(?:能|行|算)/, name: '必须/才能' },
  { re: /(?:其实|本质(?:上|是)|说到底)/, name: '本质判断' },
  { re: /(?:所以|因此|结论是)/, name: '结论句' },
  // 散文型原文很少写"不是…而是"，更多是把问题直接说出来；这一类也要能抓到。
  { re: /不够|不到位|差点?意思|不好用|难看|很丑|没有美感/, name: '问题句' },
  { re: /一定(?:遵循|有|是)|必然|总是会/, name: '规律句' },
  { re: /(?:当世|最|第一)(?:独一档|好|强|重要)/, name: '评价句' },
  { re: /我要的是|需要的是|真正想要的/, name: '需求句' },
];

const NUMBER = /(\d+(?:\.\d+)?)\s*(%|％|倍|天|小时|周|个月|年|组|套|种|次|人|个|万|亿|px|KB|MB)?/g;

function splitSentences(text) {
  return plain(text)
    .split(/(?<=[。！？；!?;])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function claimScore(sentence) {
  for (const p of CLAIM_PATTERNS) if (p.re.test(sentence)) return { score: 2, pattern: p.name };
  // 没有强标记时，短句 + 否定/转折词也算弱主张
  if (/(而|却|反而|并非|并不)/.test(sentence) && sentence.length <= 40) return { score: 1, pattern: '转折句' };
  return null;
}

/** 块级解析：标题 / 列表 / 引文 / 表格 / 图片 / 段落。 */
function parseBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  let buf = [];
  let bufStart = 0;
  let offset = 0;
  const flush = (endOffset, type = 'para') => {
    const text = buf.join('\n').trim();
    buf = [];
    if (!text) return;
    blocks.push({ type, text, start: bufStart, end: endOffset });
  };
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    const t = line.trim();
    if (!t) { flush(lineStart); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      flush(lineStart);
      blocks.push({ type: `h${h[1].length}`, text: h[2].trim(), start: lineStart, end: lineStart + line.length });
      continue;
    }
    const img = /^!\[[^\]]*\]\(([^)]+)\)/.test(t);
    if (img) {
      flush(lineStart);
      blocks.push({ type: 'image', text: t, start: lineStart, end: lineStart + line.length });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(t);
    if (quote) {
      if (!buf.length) bufStart = lineStart;
      buf.push(quote[1]);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    const ol = /^(\d+)[.、)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      if (!buf.length) bufStart = lineStart;
      buf.push(t);
      continue;
    }
    if (t.startsWith('|')) {
      if (!buf.length) bufStart = lineStart;
      buf.push(t);
      continue;
    }
    if (!buf.length) bufStart = lineStart;
    buf.push(line);
  }
  flush(offset);
  return blocks;
}

function classify(block) {
  const t = block.text;
  if (/^\|/.test(t.trim())) return 'table';
  if (/^!\[/.test(t.trim())) return 'image';
  if (/^>\s?/.test(t)) return 'quote';
  const ul = t.split('\n').filter((l) => /^[-*+]\s+/.test(l.trim()));
  const ol = t.split('\n').filter((l) => /^\d+[.、)]\s+/.test(l.trim()));
  if (ol.length >= 2) return 'step';
  if (ul.length >= 3) return 'list';
  if (/(^|\n)\s*(?:第[一二三四五六七八九十]+步|首先|其次|然后|接着|最后)/.test(t)) return 'step';
  if (/对比|相比|相比之下|而另一边|二者的区别/.test(t)) return 'compare';
  return 'para';
}

function numbersIn(text) {
  const out = [];
  let m;
  NUMBER.lastIndex = 0;
  while ((m = NUMBER.exec(text))) out.push({ value: m[1], unit: m[2] || '', at: m.index });
  return out;
}

/**
 * @param {string} md article.md 全文（可带 front matter）
 * @returns 结构化的 outline：每节一条 claim + 证据列表，全部带 span
 */
export function extractOutline(md) {
  const body = stripFrontMatter(md);
  const title = (/^\s*title:\s*(.+)$/m.exec(md.split('---')[1] || '') || [])[1]?.replace(/["']/g, '').trim()
    || (/^#\s+(.+)$/m.exec(body) || [])[1]?.trim() || '';
  const blocks = parseBlocks(body);
  const sections = [];
  let cur = null;
  const pushSection = () => {
    if (cur) sections.push(cur);
    cur = null;
  };
  // 首个标题之前的内容归到"引言"
  cur = { heading: '引言', level: 0, span: null, blocks: [] };

  for (const b of blocks) {
    const lvl = /^h(\d)$/.exec(b.type);
    if (lvl) {
      pushSection();
      cur = { heading: plain(b.text), level: Number(lvl[1]), span: { start: b.start, end: b.end }, blocks: [] };
      continue;
    }
    cur.blocks.push(b);
  }
  pushSection();

  const out = sections.map((sec, i) => {
    // ---- 主张：优先带强标记的句子；同一节只留一条（一页只讲一件事）----
    let claim = null;
    for (const b of sec.blocks) {
      if (b.type === 'image' || /^\|/.test(b.text.trim())) continue;
      for (const s of splitSentences(b.text)) {
        const sc = claimScore(s);
        if (!sc) continue;
        const at = body.indexOf(s, b.start);
        if (!claim || sc.score > claim.score) claim = { text: s, score: sc.score, pattern: sc.pattern, span: { start: at, end: at + s.length } };
      }
    }
    // 没有判断句时，取这一节最后一句完整陈述（它通常是收束句）
    if (!claim) {
      const paras = sec.blocks.filter((b) => classify(b) === 'para');
      const last = paras[paras.length - 1];
      if (last) {
        const s = splitSentences(last.text).slice(-1)[0];
        if (s) {
          const at = body.indexOf(s, last.start);
          claim = { text: s, score: 0, pattern: '收束句', span: { start: at, end: at + s.length } };
        }
      }
    }

    // ---- 证据：每块按形态归类，条目/数字都摊开，span 保留----
    const evidence = sec.blocks
      .filter((b) => b.type !== 'image' || true)
      .map((b) => {
        const form = classify(b);
        const base = { form, span: { start: b.start, end: b.end }, chars: [...plain(b.text)].length };
        if (form === 'list') {
          base.items = b.text.split('\n').filter((l) => /^[-*+]\s+/.test(l.trim())).map((l) => plain(l.replace(/^[-*+]\s+/, ''))).filter(Boolean);
        }
        if (form === 'step') {
          base.items = b.text.split('\n').map((l) => plain(l.replace(/^\d+[.、)]\s+/, '').replace(/^[-*+]\s+/, ''))).filter(Boolean);
        }
        if (form === 'table') {
          base.rows = b.text.split('\n').filter((l) => /^\|/.test(l.trim())).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
        }
        if (form === 'quote') base.quote = plain(b.text.replace(/^>\s?/gm, ''));
        if (form === 'image') base.src = (/\(([^)]+)\)/.exec(b.text) || [])[1] || '';
        const nums = numbersIn(b.text);
        if (nums.length) base.numbers = nums;
        return base;
      });

    const forms = [...new Set(evidence.map((e) => e.form))];
    // 「有数字」不等于「是数据页」：一句"出了第一套图"里的 1 不算证据。
    // 只有当数字能成组（≥2 个）或带结构性单位（%/倍/组/套/种）时才算 number。
    const anyNumbers = evidence.some((e) => e.numbers?.length);
    const strongNumber = evidence.some((e) => {
      const n = e.numbers || [];
      return n.length >= 2 || n.some((x) => /%|％|倍|组|套|种/.test(x.unit));
    });
    const primary =
      forms.includes('table') ? 'compare'
        : forms.includes('step') ? 'step'
          : forms.includes('list') ? 'list'
            : strongNumber && anyNumbers ? 'number'
              : forms.includes('image') ? 'image'
                : forms.includes('quote') ? 'quote'
                  : 'none';
    return {
      idx: i + 1,
      heading: sec.heading,
      level: sec.level,
      span: sec.span,
      claim,
      evidence,
      primary,
      chars: evidence.reduce((a, e) => a + e.chars, 0),
    };
  });

  // span 一律记成"整份文件的绝对偏移"：渲染端拿 article.md 一查就能对上。
  // 前面是在去掉 front matter 的 body 里算的，这里整体加回偏移量。
  const shift = (n) => n + md.indexOf(body);
  const withAbsSpan = (sp) => (sp && typeof sp.start === 'number' ? { start: shift(sp.start), end: shift(sp.end) } : sp);
  const shifted = out
    .filter((s) => s.chars > 0 || s.claim)
    .map((s) => ({
      ...s,
      span: withAbsSpan(s.span),
      claim: s.claim ? { ...s.claim, span: withAbsSpan(s.claim.span) } : s.claim,
      evidence: s.evidence.map((e) => ({ ...e, span: withAbsSpan(e.span) })),
    }));

  return {
    version: 'outline/1',
    title,
    article: null,
    extractedAt: new Date().toISOString(),
    sections: shifted,
    stats: {
      sections: out.length,
      withClaim: out.filter((s) => s.claim).length,
      forms: out.reduce((a, s) => ((a[s.primary] = (a[s.primary] || 0) + 1), a), {}),
    },
  };
}

/** 自检：这一步只报"结构上不能成立"的事，不涉及文风。 */
export function checkOutline(outline) {
  const issues = [];
  for (const s of outline.sections) {
    if (s.level === 1 && /^(引言|前言|序言)$/.test(s.heading)) continue;
    if (!s.claim) issues.push({ level: 'warn', where: `§${s.idx} ${s.heading}`, msg: '这一节没有判断句：要么它其实不是一节，要么主张藏在别处' });
    if (s.primary === 'none' && s.chars > 0) issues.push({ level: 'warn', where: `§${s.idx} ${s.heading}`, msg: `只有叙述没有证据形态（${s.chars} 字）：这一页只能做成金句页，或回去补证据` });
    if (s.chars < 30) issues.push({ level: 'info', where: `§${s.idx} ${s.heading}`, msg: `内容只有 ${s.chars} 字，装不了一张卡` });
  }
  const noSpan = outline.sections.filter((s) => s.claim && (!s.claim.span || s.claim.span.start < 0));
  if (noSpan.length) issues.push({ level: 'error', where: 'span', msg: `${noSpan.length} 条主张找不到原文位置：span 回填失败，outline 作废` });
  return issues;
}

/** outline → brief 的骨架：只填"从结构能推出来的字段"，其余留空等人/模型决定。 */
export function briefSkeleton(outline, { audience = '', job = '', arc = '' } = {}) {
  const pages = outline.sections
    .filter((s) => s.level >= 2 || s.idx === 1)
    .map((s) => ({
      heading: s.heading,
      claim: s.claim?.text || '',
      evidence: s.primary,
      density: s.chars > 180 ? 'dense' : s.chars > 80 ? 'balanced' : 'sparse',
      span: s.claim?.span || s.span,
    }));
  return {
    version: 'brief/1',
    audience,
    job,
    thesis: pages[0]?.claim || '',
    hook: '',
    arc: arc || pages.map((p) => p.evidence).join(' → '),
    density: pages.length <= 6 ? 'sparse' : pages.length <= 10 ? 'balanced' : 'dense',
    stance: '',
    accent: '',
    locked: ['ratio', 'margins', 'type-scale', 'header-grid'],
    pages,
  };
}

// ---- CLI：node outline.mjs <article.md> [--out 目录] -------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node outline.mjs <article.md> [--out 目录]');
    process.exit(2);
  }
  const md = fs.readFileSync(file, 'utf8');
  const outline = extractOutline(md);
  const outArg = process.argv.indexOf('--out');
  const dir = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'outline.json'), JSON.stringify(outline, null, 2));
  for (const s of outline.sections) {
    console.log(`${String(s.idx).padStart(2, '0')} ${s.heading.padEnd(12, '　')} ${s.primary.padEnd(8)} ${String(s.chars).padStart(4)} 字  ${s.claim ? `「${s.claim.text.slice(0, 26)}」` : '—'}`);
  }
  const issues = checkOutline(outline);
  for (const i of issues) console.log(`  ${i.level === 'error' ? '✗' : i.level === 'warn' ? '⚠' : '·'} ${i.where}：${i.msg}`);
  console.log(`\noutline → ${path.join(dir, 'outline.json')}`);
}
