// 卡型映射表：**一处定义，plan（灰模）与 card（成图）共用**。
// 规则：一节写什么形态的证据，就落什么卡型；role 是内容声明，不是猜出来的标签。
// 这个文件是「版式跟着内容走」的唯一真相源——改动只加在这里，两边自动同步。
import { plain } from './markup.mjs';

/** role → 引擎的卡型（kind）。`grid` 已于 2026-11-11 下线：一字一格在手机卡上是空表。 */
export const ROLE_KIND = {
  claim: 'claim',
  compare: 'compare',
  timeline: 'timeline',
  stat: 'stat',
  opener: 'opener',
  fig: 'fig',       // 图卡证据：图占卡高 45–65%，文字让位（M10 / S08）
  divider: 'opener',
};

/** 证据形态 → 推荐的 role（改写端也可以显式写 role 覆盖它）。 */
export const EVIDENCE_ROLE = {
  none: 'claim',    // 纯判断：只能出金句 / 大字提问，且必须带锚点
  compare: 'compare',
  step: 'timeline',
  list: 'process',  // 3–6 条并列：走清单卡（stages）
  number: 'stat',
  quote: 'claim',   // 引文 → 金句页 + 出处行
  image: 'fig',     // 图 / 截图 → 图卡证据（图自己撑卡，不缩成小配图）
};

/** 有结构化证据才自动落的卡型。`none` / `quote` 这类要人明确声明，否则每节都会被判成金句页。 */
export const AUTO_KINDS = new Set(['fig', 'compare', 'stat', 'timeline']);

const CMP = /对比|比较|差异|区别|相较|而不是|\bvs\b|versus/i;

/** 这一节真的带得动它的 role 吗？带不动就退回常规卡，别硬排。 */
export function roleReady(s, kind) {
  switch (kind) {
    case 'claim': return !!plain(s.claim?.text || s.card?.text || s.paragraphs?.[0] || '');
    case 'compare': return !!(s.compare?.left?.items?.length && s.compare?.right?.items?.length);
    case 'timeline': return (s.timeline || []).length >= 2;
    case 'stat': return (s.stats || []).some((x) => plain(x?.value));
    case 'opener': return true;
    case 'fig': return !!(s.figures || []).length;
    default: return false;
  }
}

/**
 * 证据形态推断：从这一节实际有的字段反推它该长什么样。
 * 顺序有讲究——先看结构化证据，再看文字特征，最后才看长度。
 */
export function evidenceForm(s, card = {}) {
  if ((s.compare?.left?.items || []).length && (s.compare?.right?.items || []).length) return 'compare';
  if ((s.timeline || []).length >= 2) return 'timeline';
  if ((s.stats || []).some((x) => plain(x?.value))) return 'number';
  if ((s.stages || []).length >= 2) return 'step';
  if ((s.figures || []).length && card.figure !== 'none') return 'image';
  if ((card.bullets || []).length >= 3) return 'list';
  if (s.quote || (s.paragraphs || []).length === 1 && plain(s.paragraphs?.[0]).length <= 40 && /「|」|“|”/.test(String(s.paragraphs?.[0]))) return 'quote';
  const heading = plain(s.heading);
  const text = plain(card.text ?? (s.paragraphs || [])[0] ?? '');
  if (CMP.test(heading) || /相比之下|反过来说|而不是/.test(text)) return 'compare';
  if (text.length <= 40 && (s.paragraphs || []).length <= 1) return 'none';
  return 'sec';
}

/** 由证据形态 + 显式 role 决定 role（显式 role 优先）。 */
export function deriveRole(s, card = {}) {
  if (s.kind === 'checklist') return s.guard ? 'checklist' : 'process';
  if (s.role) return s.role === 'divider' ? 'opener' : s.role;
  const form = evidenceForm(s, card);
  const role = EVIDENCE_ROLE[form] || 'sec';
  // 清单：有 stages 才能走 process；否则一段长文就是常规卡。
  if (role === 'process' && !(s.stages || []).length) return 'list';
  return role;
}

/**
 * 归纳一个 role 的「证据形态」，供灰模与校验统一口径。
 * 无效 role（带不动证据）在这里就被降级，不让它进渲染。
 */
export function settleRole(s, card = {}) {
  const role = deriveRole(s, card);
  const kind = ROLE_KIND[role];
  if (kind && !roleReady(s, kind)) return 'sec';
  return role;
}
