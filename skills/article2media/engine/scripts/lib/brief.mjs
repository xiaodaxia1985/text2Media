// L1：outline.json → brief.json。
// outline 只摊结构；brief 是"这一组图要讲什么"的定稿：每页一条主张、一条证据形态、一个密度档、一段原文出处。
// 之后 content.json 的每一节都可以从这里抄 claim / evidence / span，渲染端再回原文校验 span。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOutline } from './outline.mjs';

export const DENSITY_MAX = { claim: 30, opener: 12, compare: 4, timeline: 6, stat: 3, list: 6 }; // 与 card-schema 容量上限一致

const plain = (s) => String(s ?? '').replace(/\s+/g, '').replace(/[，。、；：！？,.;:!?"'“”‘’（）()《》…—·]/g, '');

/** 从 outline 定稿一份 brief：只保留能成页的节，其余留给人判断。 */
export function buildBrief(outline, { audience = '', job = '', thesis = '', arc = '', accent = '' } = {}) {
  const pages = [];
  if (outline.sections.length) {
    const first = outline.sections[0];
    pages.push({ id: 1, kind: 'cover', heading: outline.title || first.heading, claim: { text: thesis || first.claim?.text || first.heading, span: first.claim?.span || null }, evidence: 'none', density: 'sparse', chars: 0, form: null });
  }
  for (const s of outline.sections) {
    if (s.level >= 2) pages.push({ id: pages.length + 1, kind: 'section', heading: s.heading, claim: s.claim ? { text: s.claim.text, span: s.claim.span, pattern: s.claim.pattern } : null, evidence: s.primary, form: s.primary, density: s.chars > 180 ? 'dense' : s.chars > 80 ? 'balanced' : 'sparse', chars: s.chars });
  }
  pages.push({ id: pages.length + 1, kind: 'end', heading: '全文要点', claim: { text: '', span: null }, evidence: 'none', density: 'sparse', chars: 0 });
  return {
    version: 'brief/1',
    audience, job,
    thesis: thesis || pages[0]?.claim?.text || '',
    hook: '',
    arc: arc || pages.map((p) => p.form || p.kind).join(' → '),
    density: pages.length <= 8 ? 'sparse' : pages.length <= 12 ? 'balanced' : 'dense',
    stance: '', accent,
    locked: ['ratio', 'margins', 'type-scale', 'header-grid', 'role-map'],
    article: outline.article || null,
    pages,
  };
}

/** brief 自检：判据必须是"结构上说不通"，不是偏好。 */
export function checkBrief(brief) {
  const issues = [];
  for (const p of brief.pages) {
    const where = `${String(p.id).padStart(2, '0')} ${p.heading || p.kind}`;
    if (p.kind !== 'cover' && p.kind !== 'end') {
      if (!p.claim || !p.claim.text) issues.push({ level: 'error', where, msg: '这一页没有主张：一张卡讲不出一句话，就不该占一页' });
      else if ([...p.claim.text].length > DENSITY_MAX.claim) issues.push({ level: 'warn', where, msg: `主张 ${[...p.claim.text].length} 字，改写时要压到 ${DENSITY_MAX.claim} 字以内（原句直接上卡会折成四行）` });
      if (p.evidence === 'none' && p.chars > 80) issues.push({ level: 'error', where, msg: `只有叙述没有证据（${p.chars} 字）：做出来只能当金句页，回去补表格/步骤/数字/清单` });
      if (p.chars > 0 && p.chars < 45 && !['claim', 'opener'].includes(p.evidence)) issues.push({ level: 'warn', where, msg: `正文 ${p.chars} 字，装不满一张卡（渲染期覆盖率会低于 78%）` });
    }
    if (p.claim?.span && (p.claim.span.start < 0 || p.claim.span.end <= p.claim.span.start)) issues.push({ level: 'error', where, msg: 'span 不成立（起点/终点非法）' });
  }
  if (brief.pages.length > 18) issues.push({ level: 'error', where: '整组', msg: `${brief.pages.length} 页，小红书 3:4 上限 18 张` });
  return issues;
}

/** 回原文核对：span 指的那一段到底是不是这句话。 */
export function verifyBriefSpans(brief, md) {
  const issues = [];
  for (const p of brief.pages) {
    if (!p.claim?.span || !md) continue;
    const slice = md.slice(p.claim.span.start, p.claim.span.end);
    const hit = plain(slice).includes(plain(p.claim.text)) || plain(p.claim.text).includes(plain(slice));
    if (!hit) issues.push({ level: 'error', where: `第 ${p.id} 页`, msg: `span 指向的原文对不上主张「${p.claim.text.slice(0, 20)}」：span 是抄错的，回去重抽` });
  }
  return issues;
}

/** 把 brief 的一页抄进 content.json 的节（只抄机械字段，文字仍由改写端定）。 */
export function pageToSection(page) {
  return {
    role: page.evidence === 'step' ? 'timeline' : page.evidence === 'none' ? 'claim' : undefined,
    claim: page.claim?.text ? { text: page.claim.text } : undefined,
    evidence: page.form,
    span: page.claim?.span || undefined,
    density: page.density,
  };
}

// ---- CLI：node brief.mjs <article.md> [--out 目录] -----------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node brief.mjs <article.md> [--out 目录]');
    process.exit(2);
  }
  const md = fs.readFileSync(file, 'utf8');
  const outline = extractOutline(md);
  const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
  const brief = buildBrief(outline, { audience: argOf('--audience'), job: argOf('--job'), arc: argOf('--arc') });
  const dir = argOf('--out') ? path.resolve(argOf('--out')) : path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
  for (const p of brief.pages) {
    console.log(`${String(p.id).padStart(2, '0')} ${p.kind.padEnd(7)} ${(p.form || '—').padEnd(8)} ${String(p.chars).padStart(4)} 字  ${p.claim?.text ? `「${p.claim.text.slice(0, 30)}」` : '—'}`);
  }
  for (const i of [...checkBrief(brief), ...verifyBriefSpans(brief, md)]) {
    console.log(`  ${i.level === 'error' ? '✗' : '⚠'} ${i.where}：${i.msg}`);
  }
  console.log(`\nbrief → ${path.join(dir, 'brief.json')}`);
}
