// "card" layout: fixed-ratio cards for carousels (小红书 3:4, Instagram 4:5, 1:1, 9:16), 540 CSS px wide → 1080 px at 2x.
// Same content.json as the long layout; optional `cover`, `xhs` and per-section `card` hints refine it.
import { esc, md, pad2, plain, vlen } from './markup.mjs';
import { fontsStyle } from './fonts.mjs';
import { renderFigure } from './figures.mjs';
import { LABELS, accVar, panelBlock } from './layout-long.mjs';
import { coverIllustrationSrc, coverIllustrationAspect } from './illustrations.mjs';
import { ROLE_KIND, roleReady, AUTO_KINDS, EVIDENCE_ROLE } from './role-map.mjs';
import { claimTier, titleTier } from './metrics.mjs';

export const RATIOS = {
  '3:4': { w: 540, h: 720, limit: 18, name: '小红书 / 3:4' }, // 小红书 allows at most 18 images per note
  '4:5': { w: 540, h: 675, limit: 20, name: 'Instagram / 4:5' },
  '1:1': { w: 540, h: 540, limit: 20, name: '方图 / 1:1' },
  '9:16': { w: 540, h: 960, limit: 20, name: '竖屏 / 9:16' },
};
export function ratioSpec(r = '3:4') {
  const spec = RATIOS[r];
  if (!spec) throw new Error(`不支持的比例 ${r}，可用：${Object.keys(RATIOS).join('、')}`);
  // Usable height of .c-body is the card height minus padding, header and footer (measured: 720 → 613).
  return { ...spec, key: r, slug: r.replace(':', 'x'), budget: spec.h - 124 };
}

// Rough height estimates (CSS px) used to pack checklist stages into cards.
// They mirror card.css; QA still measures the real layout afterwards.
const lines = (text, perLine) => Math.max(1, Math.ceil(vlen(text || '') / perLine));
const headH = (s, first) =>
  36 + // label pill + gap
  (first ? 37 : 28) * Math.max(String(s.heading || '').split('\n').length, lines(String(s.heading || '').replace(/\n/g, ''), first ? 16 : 21)) +
  12 +
  (first ? (s.paragraphs || []).slice(0, 1).reduce((h, p) => h + 29 * lines(p, 28) + 12, 0) : 0);
const stageH = (st) =>
  22 + 26 + (st.items || []).reduce((h, t) => h + 21.7 * lines(t, 29) + 4, 0) + (st.done ? 12 + 19 * lines(st.done, 33) : 0) + 10;
const guardH = (g) => 30 + 32 + (g.items || []).reduce((h, t) => h + 22.5 * lines(t, 27) + 8, 0) + (g.note ? 26 : 0) + 12;

// Split stages into the fewest cards that fit, then pick the most even split
// (the guard block, if any, rides on the last card). At most 6 stages, so brute force is cheap.
function packStages(s, num, k, budget) {
  const stages = s.stages || [];
  const hs = stages.map(stageH);
  const g = s.guard ? guardH(s.guard) : 0;
  const n = stages.length;
  const fill = (from, to, first, last) => headH(s, first) + hs.slice(from, to).reduce((a, b) => a + b, 0) + (last ? g : 0);

  // All ways to cut [0, n) into `parts` contiguous groups; the last group may be empty (guard only).
  function* cuts(parts, start = 0) {
    if (parts === 1) { yield [[start, n]]; return; }
    for (let end = start + 1; end <= n; end++) for (const rest of cuts(parts - 1, end)) yield [[start, end], ...rest];
  }

  for (let parts = 1; parts <= Math.max(1, n + (g ? 1 : 0)); parts++) {
    let best = null;
    for (const groups of cuts(parts)) {
      const used = groups.map(([a, b], i) => fill(a, b, i === 0, i === groups.length - 1));
      if (used.some((u) => u > budget)) continue;
      const spread = Math.max(...used) - Math.min(...used);
      if (!best || spread < best.spread) best = { groups, spread };
    }
    if (best) {
      return best.groups.map(([from, to], i) => ({
        kind: from === to ? 'guard' : 'stages', s, num, k, from, to, first: i === 0,
        guard: !!g && i === best.groups.length - 1 && from !== to,
      }));
    }
  }
  // Nothing fits (a single huge stage): one stage per card and let QA report the overflow.
  const out = stages.map((_, i) => ({ kind: 'stages', s, num, k, from: i, to: i + 1, first: i === 0 }));
  if (g) out.push({ kind: 'guard', s, num, k });
  return out.length ? out : [{ kind: 'stages', s, num, k, from: 0, to: 0, first: true }];
}

const CL = {
  zh: {
    kicker: (n) => `长文拆解 · ${n} 张图读完`,
    toc: '这组图讲了',
    cont: '续',
    recap: '全文要点',
    cta: '收藏这组图，用的时候翻出来',
    credit: (s) => `原文｜${[s.author, s.handle].filter(Boolean).join(' ')}${s.platform ? ` · ${s.platform}` : ''}`,
  },
  en: {
    kicker: (n) => `Long read · ${n} cards`,
    toc: 'Inside',
    cont: 'cont.',
    recap: 'Key takeaways',
    cta: 'Save this for later',
    credit: (s) => `Source: ${[s.author, s.handle].filter(Boolean).join(' ')}${s.platform ? ` · ${s.platform}` : ''}`,
  },
};

/** 卡型决策（role → kind、role 是否带得动）全部移到 role-map.mjs，
 *  灰模（layout-plan.mjs）与成图（本文件）共用同一份，避免预览与成图对不上。 */

/** Decide which cards to make, in order. Shared by the builder and the validator. */
export function planCards(content, ratio = '3:4', budgetAdjust = 0) {
  const budget = ratioSpec(ratio).budget - budgetAdjust;
  const plan = [{ kind: 'cover' }];
  let num = 0;
  for (const pg of content.pages || []) {
    for (const s of pg.sections || []) {
      // card.mode="skip" 对任何卡型都生效（主张 / 时间线也要能跳过），跳过的节不占页码。
      if (s.card?.mode === 'skip') continue;
      num += 1;
      const k = num - 1;
      if (s.kind === 'checklist' || (s.role === 'checklist' && (s.stages || []).length)) {
        plan.push(...packStages(s, num, k, budget));
        continue;
      }
      // 声明了 metric 的节自己成一张数字卡：一个数加走势，不必再退回正文卡。
      if (s.metric) {
        plan.push({ kind: 'metric', s, num, k, pg });
        continue;
      }
      const roleKind = ROLE_KIND[s.role];
      if (roleKind && roleReady(s, roleKind)) {
        plan.push({ kind: roleKind, s, num, k, pg });
        continue;
      }
      // 没写 role、但声明了证据形态：结构化证据（图 / 对照 / 数字 / 步骤）自己决定卡型。
      // 只自动落这四种——`none`、`quote` 要人明确声明，否则每节都会变成金句页。
      if (!s.role && s.evidence) {
        const auto = ROLE_KIND[EVIDENCE_ROLE[s.evidence]];
        if (auto && AUTO_KINDS.has(auto) && roleReady(s, auto)) {
          plan.push({ kind: auto, s, num, k, pg });
          continue;
        }
      }
      const mode = s.card?.mode || 'single';
      if (mode === 'skip') continue; // 上面已拦过一次；这里兜住无 role 的正文卡旧写法
      plan.push({ kind: 'sec', s, num, k, part: 1, split: mode === 'split' });
      if (mode === 'split') plan.push({ kind: 'sec', s, num, k, part: 2, split: true });
    }
  }
  plan.push({ kind: 'end' });
  return plan;
}

// data-drop marks optional elements; window.__fit hides them in ascending order when a card overflows.
const drop = (order, name) => ` data-drop="${order}" data-drop-name="${name}"`;

function figBlock(f, id, capOrder = 2, withCaption = true) {
  if (!f) return '';
  return (
    `<figure class="c-fig" data-fig="${id}"${drop(9, '图')}><div class="c-fig-card"><div class="c-fig-box"><div class="fig-canvas">${renderFigure(f)}</div></div></div>` +
    (withCaption && f.caption ? `<figcaption class="c-cap" data-qa-text${drop(capOrder, '图注')}>${md(f.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

function frame(inner, { idx, total, series, foot, cls = '', acc, kind, tag = '' }) {
  return (
    `<section class="card acc ${cls}" data-card="${idx}" data-kind="${kind}" style="--acc:${acc}">` +
    `<header class="c-top"><span class="c-top-s">${md(series)}</span>` +
    `<span class="c-top-t">${tag ? md(tag) : ''}</span>` +
    `<span class="c-top-p">${pad2(idx)} / ${pad2(total)}</span></header>` +
    `<div class="c-body">${inner}</div>` +
    `<footer class="c-foot"><span>${md(foot)}</span></footer>` +
    `</section>`
  );
}

function coverCard(c, L, total) {
  const cover = c.cover || {};
  const pages = c.pages || [];
  let points = cover.points;
  if (!points) {
    points = pages.length > 1
      ? pages.map((p) => String(p.part || '').replace(/^[^·]*·\s*/, ''))
      : (pages[0]?.sections || []).map((s) => plain(s.heading).replace(/\n/g, '')).slice(0, 6);
  }
  // With an AI cover illustration the picture takes the TOC's place.
  const ill = coverIllustrationSrc(c);
  return (
    `<div class="cv-kicker">${md(cover.kicker || L.kicker(total))}</div>` +
    `<h1 class="cv-title" data-qa-text style="--cv-fs:${titleTier(headText(cover.title || c.title))}px">${md(headText(cover.title || c.title))}</h1>` +
    `<div class="cv-rule"></div>` +
    (ill ? `<div class="cv-ill"><img src="${esc(ill)}" style="aspect-ratio:${coverIllustrationAspect(c)}" alt=""></div>` : '') +
    ((cover.subtitle ?? pages[0]?.intro) ? `<p class="cv-sub" data-qa-text${drop(2, '封面副标题')}>${md(cover.subtitle ?? pages[0].intro)}</p>` : '') +
    (ill ? '' : `<div class="cv-toc"${drop(1, '封面目录')}><div class="cv-toc-h">${esc(L.toc)}</div><ol>${points
      .filter(Boolean)
      .map((p) => `<li><span data-qa-text>${md(p)}</span></li>`)
      .join('')}</ol></div>`)
  );
}

function secCard(it, L) {
  const s = it.s;
  const card = s.card || {};
  const figs = s.figures || [];
  const label = ''; // 节标签显示在页顶中格（frame 的 tag），正文里不再出现
  const heading = secHeading(s.heading, it.part === 2);
  const fi = card.figure === 'none' ? -1 : Number.isInteger(card.figure) ? card.figure : 0;

  if (it.part === 2) {
    const other = figs.findIndex((_, j) => j !== fi);
    return label + heading + (other >= 0 ? figBlock(figs[other], `${it.num}${'AB'[other]}`, 1) : '') + panelBlock(s.panel);
  }
  const text = card.text ?? s.paragraphs?.[0];
  const bullets = card.bullets || [];
  return (
    label +
    heading +
    (text ? `<p class="c-text" data-qa-text${drop(5, '正文')}>${md(text)}</p>` : '') +
    (fi >= 0 && figs[fi] ? figBlock(figs[fi], `${it.num}${'AB'[fi]}`) : '') +
    (bullets.length ? `<ul class="c-bullets"${drop(1, '要点')}>${bullets.map((b) => `<li data-qa-text>${md(b)}</li>`).join('')}</ul>` : '') +
    (card.panel && !it.split && s.panel ? `<div${drop(3, '数据面板')}>${panelBlock(s.panel)}</div>` : '') +
    (s.takeaway ? `<p class="c-take" data-qa-text>${md(s.takeaway)}</p>` : '')
  );
}

// ---- role cards: a section says what it is, the card shape follows ----
const roleLabel = () => ''; // 节标签显示在页顶中格
// 大标题（封面 / 节标题 / 主张）不写逗号句号：标点在这里只负责断行，断完就删。
// 「能出图，不等于好看的图。」→ 三行「能出图 / 不等于 / 好看的图」
const HEAD_PUNCT = /[，。、；：！？,;:!?]+/g;
function headText(s) {
  return String(s ?? '')
    .split('\n')
    .map((line) => line.replace(HEAD_PUNCT, '\n'))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
/** 节标题：同一套五档尺子，但收在 24–38px（节标题要让位给主体），续卡再按 0.76 缩。 */
const secHeading = (text, cont = false) =>
  `<h2 class="sec-h${cont ? ' cont' : ''}" data-qa-text style="--sec-fs:${titleTier(headText(text), { min: 24, max: 38 })}px">${md(headText(text))}</h2>`;
const roleHead = (it) => secHeading(it.s.heading);

function claimCard(it) {
  const s = it.s;
  const card = s.card || {};
  const text = s.claim?.text ?? card.text ?? s.paragraphs?.[0] ?? '';
  const note = s.claim?.note ?? s.takeaway;
  // A short claim is the whole page: scale the type so the statement owns the card instead of
  // sitting in it as one small line. Long claims keep the base size or they would fill the page.
  const head = headText(text);
  // 字号按「去标点字数」走五档（metrics.mjs → titleTier / claimTier），和封面、节标题同一套尺子。
  const fs = claimTier(head);
  return (
    roleLabel(it) +
    `<div class="c-claim" data-qa-text style="--claim-fs:${fs}px">${md(head)}</div>` +
    `<div class="c-claim-rule"></div>` +
    (note ? `<p class="c-claim-note" data-qa-text${drop(1, '补充')}>${md(note)}</p>` : '')
  );
}

function compareCard(it) {
  const s = it.s;
  const cp = s.compare || {};
  const l = cp.left || {};
  const r = cp.right || {};
  const n = Math.max((l.items || []).length, (r.items || []).length);
  const lead = s.paragraphs?.[0];
  // Align the two sides row by row: comparison only reads as comparison when the rows share a grid.
  const rows = Array.from({ length: n }, (_, i) =>
    `<div class="c-cmp-row"><div class="c-cmp-cell">${md(l.items?.[i] || '')}</div>` +
    `<div class="c-cmp-cell r">${md(r.items?.[i] || '')}</div></div>`).join('');
  return (
    roleLabel(it) +
    roleHead(it) +
    (lead ? `<p class="c-cmp-lead" data-qa-text>${md(lead)}</p>` : '') +
    `<div class="c-cmp"><div class="c-cmp-head"><div class="c-cmp-th">${md(l.title || '')}</div>` +
    `<div class="c-cmp-th r">${md(r.title || '')}</div></div>${rows}` +
    (cp.note ? `<p class="c-cmp-note" data-qa-text>${md(cp.note)}</p>` : '') +
    `</div>`
  );
}

function timelineCard(it) {
  const items = (it.s.timeline || []).slice(0, 6);
  // 节点不挂任何标记：顺序由位置表达，时间由真实 at 表达。
  // 补 01、02 或加圆点，都只是在本来干净的分隔线上再添一层噪音。
  return (
    roleLabel(it) +
    roleHead(it) +
    // timelineStyle="split" 换一种读法：左右分栏的索引式（这一步叫什么 / 具体做什么），
    // 和默认的居中阶梯并存——同一组里两条流程不该长得一样。
    `<div class="c-tl${it.s.timelineStyle === 'split' ? ' c-tl-split' : ''}">${items
      .map(
        (t, i) =>
          `<div class="c-tl-item"><div class="c-tl-rail"><i></i></div><div class="c-tl-body">` +
          (t.at ? `<small>${md(t.at)}</small>` : '') +
          `<b data-qa-text>${md(t.title || '')}</b>` +
          (t.note ? `<span data-qa-text${drop(6, '节点说明')}>${md(t.note)}</span>` : '') +
          `</div></div>`
      )
      .join('')}</div>`
  );
}

function statCard(it) {
  const s = it.s;
  const list = (s.stats || []).slice(0, 3);
  // Rows, not a row of three numbers: one number per line keeps the card full and the basis legible.
  return (
    roleLabel(it) +
    roleHead(it) +
    `<div class="c-stats">${list
      .map(
        (st) =>
          `<div class="c-stat"><b class="${/[0-9]/.test(String(st.value)) ? '' : 'cjk'}">${md(st.value)}${st.unit ? `<em>${md(st.unit)}</em>` : ''}</b>` +
          `<div class="c-stat-meta"><small>${md(st.label || '')}</small>` +
          (st.note ? `<span data-qa-text${drop(6, '数字说明')}>${md(st.note)}</span>` : '') +
          `</div></div>`
      )
      .join('')}</div>` +
    (s.takeaway ? `<p class="c-take" data-qa-text${drop(3, '结论')}>${md(s.takeaway)}</p>` : '')
  );
}

// 数字卡（metric）：一个数，加它怎么长起来的。和视频的 trend 镜共用一套规矩——
// 小数位照数值写（98.7 不会变 99），单位另起小号（「48 小时」不折行）。
function metricSpark(vals) {
  const W = 300, H = 92, pad = 6;
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const x = (i) => pad + (i * (W - pad * 2)) / (vals.length - 1);
  const y = (v) => H - 12 - ((v - min) / Math.max(1e-6, max - min)) * (H - 26);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polygon points="${pts} ${W - pad},${H - 8} ${pad},${H - 8}"/><polyline points="${pts}"/></svg>`;
}

// 环图（抄 chart-story 的 donut）：把「一个数占整体的多少」画成真实圆弧。
// 数字放在环心里，环只是把比例摊开，不再是数字旁边一个多余的圈。静态卡不做扫圆动画。
function ringShapes(share) {
  const R = 76, C = 100;
  const deg = Math.min(1, Math.max(0, share)) * 360;
  const ex = C + R * Math.cos(((deg - 90) * Math.PI) / 180);
  const ey = C + R * Math.sin(((deg - 90) * Math.PI) / 180);
  const d = `M ${C} ${C - R} A ${R} ${R} 0 ${deg > 180 ? 1 : 0} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  return `<circle class="c-ring-track" cx="${C}" cy="${C}" r="${R}"/><path class="c-ring-arc" d="${d}"/>`;
}

function metricCard(it) {
  const s = it.s;
  const m = s.metric || {};
  const raw = String(m.value ?? '').replace(/,/g, '');
  const dec = Number.isFinite(Number(m.decimals)) ? Math.max(0, Number(m.decimals)) : (raw.split('.')[1] || '').length;
  const n = Number(raw);
  const fig = Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : raw;
  const unit = m.unit || '';
  const sym = unit ? '' : (m.suffix || '');
  const vals = (m.values || []).map(Number).filter((v) => Number.isFinite(v));
  const labels = (m.labels || []).map((l) => `<span>${md(l)}</span>`).join('');
  const ringBody = m.ring
    ? `<div class="c-ring"><svg viewBox="0 0 200 200" role="img" aria-label="${esc(m.label || fig + sym)}">${ringShapes(Number(m.value) / (Number(m.total) || 100))}</svg>` +
      `<div class="c-ring-mid"><div class="c-ring-fig"><b>${md((m.prefix || '') + fig + sym)}</b>${unit ? `<em>${md(unit)}</em>` : ''}</div>` +
      (m.label ? `<div class="c-ring-lab">${md(m.label)}</div>` : '') +
      `</div></div>`
    : '';
  return (
    roleLabel(it) +
    roleHead(it) +
    `<div class="c-metric">` +
    (ringBody || `<div class="c-metric-fig"><b>${md((m.prefix || '') + fig + sym)}</b>${unit ? `<em>${md(unit)}</em>` : ''}</div>`) +
    (!ringBody && m.label ? `<div class="c-metric-label">${md(m.label)}</div>` : '') +
    (vals.length >= 2 ? `<div class="c-metric-spark"${drop(6, '走势图')}>${metricSpark(vals)}</div>` : '') +
    (labels ? `<div class="c-metric-x"${drop(7, '走势标签')}>${labels}</div>` : '') +
    (m.note ? `<p class="c-metric-note" data-qa-text${drop(5, '数字说明')}>${md(m.note)}</p>` : '') +
    `</div>` +
    (s.takeaway ? `<p class="c-take" data-qa-text${drop(3, '结论')}>${md(s.takeaway)}</p>` : '')
  );
}

// 图卡证据（M10 / S08）：图自己撑起这张卡——占卡高 45–65%，文字让位，
// 说明压在 ≤40 字，有数字就排一行小号数字，不跟图抢位置。
function figCard(it, L) {
  const s = it.s;
  const card = s.card || {};
  const figs = s.figures || [];
  const fi = card.figure === 'none' ? -1 : Number.isInteger(card.figure) ? card.figure : 0;
  const f = figs[fi] || figs[0];
  if (!f) return secCard(it, L);
  const cap = plain(card.text ?? f.caption ?? (s.paragraphs || [])[0] ?? '');
  const stats = (s.stats || []).slice(0, 3);
  return (
    roleLabel(it) +
    secHeading(s.heading) +
    `<div class="c-figgroup">` +
    figBlock(f, `${it.num}F`, 2, false) +
    (cap ? `<p class="c-fig-cap" data-qa-text${drop(5, '图注')}>${md(cap)}</p>` : '') +
    (stats.length
      ? `<div class="c-fig-stats">${stats
          .map((st) => `<div class="c-fig-stat"><b>${md(st.value)}${st.unit ? `<em>${md(st.unit)}</em>` : ''}</b><small>${md(st.label || '')}</small></div>`)
          .join('')}</div>`
      : '') +
    `</div>`
  );
}

function openerCard(it) {  const s = it.s;
  const lead = (s.paragraphs || [])[0] || '';
  // 章节页：幕标（这一部分叫什么）+ 标题 + 短线 + 导语。
  // 不放节序号——它和右上角的页码（05 / 09）是两套编号，同屏出现只会让人以为排错。
  const act = plain(it.pg?.part || '').split('·')[0].trim();
  return (
    `<div class="c-open">` +
    (act ? `<div class="c-open-kicker">${md(act)}</div>` : '') +
    `<div class="c-open-h" data-qa-text>${md(s.heading)}</div>` +
    `<div class="c-open-rule"></div>` +
    (lead ? `<p class="c-open-lead" data-qa-text>${md(lead)}</p>` : '') +
    `</div>`
  );
}

function guardBlock(g) {
  return (
    `<div class="c-guard"><div class="c-guard-h">${md(g.title)}</div>` +
    `<ul>${(g.items || []).map((t) => `<li><i class="c-x">✕</i><span data-qa-text>${md(t)}</span></li>`).join('')}</ul>` +
    (g.note ? `<div class="c-guard-note"${drop(1, '护栏说明')}>${md(g.note)}</div>` : '') +
    `</div>`
  );
}

function stagesCard(it, L, nAcc) {
  const s = it.s;
  const label = ''; // 节标签显示在页顶中格（frame 的 tag），正文里不再出现
  const heading = secHeading(s.heading, !it.first);
  const intro = it.first ? (s.paragraphs || []).slice(0, 1).map((p) => `<p class="c-text" data-qa-text${drop(1, '清单导语')}>${md(p)}</p>`).join('') : '';
  const stages = (s.stages || []).slice(it.from, it.to).map((st, j) =>
    `<div class="c-stage acc" style="--acc:${accVar(it.k + it.from + j, nAcc)}">` +
    `<div class="c-stage-h"><small>${md(st.label || '')}</small><b>${md(st.title)}</b></div>` +
    `<ul>${(st.items || []).map((t) => `<li><i class="c-box"></i><span data-qa-text>${md(t)}</span></li>`).join('')}</ul>` +
    (st.done ? `<div class="c-done" data-qa-text><b>${esc(L.done)}</b>${md(st.done)}</div>` : '') +
    `</div>`).join('');
  return label + heading + intro + `<div class="c-stages">${stages}</div>` + (it.guard && s.guard ? guardBlock(s.guard) : '');
}

function guardCard(it, L) {
  const s = it.s;
  return (
    // 节标签在页顶中格，这里只留续卡标题
    secHeading(s.heading, true) +
    guardBlock(s.guard) +
    (s.note ? `<p class="c-note"${drop(2, '清单说明')}>${md(s.note)}</p>` : '')
  );
}

function endCard(c, L, footnote) {
  const takeaways = (c.pages || []).flatMap((p) => (p.sections || []).map((s) => s.takeaway).filter(Boolean));
  const lastClosing = c.pages?.[c.pages.length - 1]?.closing;
  const summary = c.cover?.summary || lastClosing || '';
  return (
    `<div class="end-main">` +
    (summary ? `<h2 class="end-h" data-qa-text>${md(summary)}</h2>` : '') +
    `<ol class="end-list${takeaways.length > 9 ? ' dense' : ''}" data-shrink>${takeaways
      .map((t) => `<li><span data-qa-text>${md(t)}</span></li>`)
      .join('')}</ol>` +
    `<div class="end-src"${drop(1, '来源说明')}>${md(footnote)}</div>` +
    `<div class="end-cta"${drop(2, '收藏提示')}>${esc(c.cover?.cta || L.cta)}</div></div>`
  );
}

/**
 * Build one HTML document holding every card in a grid (also used as a contact sheet).
 * ctx: { content, brand, themeCss, componentsCss, layoutCss, nAcc, ratio }
 */
export function buildCards(ctx) {
  const { content: c, brand, themeCss, componentsCss, layoutCss, nAcc } = ctx;
  const R = ratioSpec(ctx.ratio || '3:4');
  const lang = c.lang === 'en' ? 'en' : 'zh';
  const L = { ...LABELS[lang], ...CL[lang] };
  const plan = planCards(c, R.key, ctx.budgetAdjust || 0);
  const total = plan.length;
  const series = c.series || brand.series || '';
  const editor = brand.editor || (lang === 'zh' ? '编者' : 'the editor');
  const footnote = c.footnote || (c.source ? L.footnote(c.source, editor) : '');
  const credit = c.source ? L.credit(c.source) : '';
  const brandFoot = [brand.name, brand.handle].filter(Boolean).join(' ');

  // 页顶中格统一放"这一张是什么"：内容卡 = 节标签，封面 = 导读，章节页 = 节标签，收尾 = 全文要点。
  const tagOf = (it) => plain(it.s?.label || '');
  const cards = plan.map((it, i) => {
    const idx = i + 1;
    const base = { idx, total, series, foot: credit, kind: it.kind };
    switch (it.kind) {
      case 'cover':
        return frame(coverCard(c, L, total), { ...base, cls: 'c-cover', acc: accVar(0, nAcc), tag: lang === 'en' ? 'Overview' : '导读', foot: [credit, brandFoot].filter(Boolean).join('　') });
      case 'sec':
        return frame(secCard(it, L), { ...base, cls: `c-sec${it.part === 2 ? ' c-sec-2' : ''}`, acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'claim':
        return frame(claimCard(it), { ...base, cls: 'c-claimcard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'compare':
        return frame(compareCard(it), { ...base, cls: 'c-cmpcard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'timeline':
        return frame(timelineCard(it), { ...base, cls: 'c-timeline', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'stat':
        return frame(statCard(it), { ...base, cls: 'c-statcard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'metric':
        return frame(metricCard(it), { ...base, cls: 'c-metriccard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'opener':
        return frame(openerCard(it), { ...base, cls: 'c-openercard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'fig':
        return frame(figCard(it, L), { ...base, cls: 'c-figcard', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'stages':
        return frame(stagesCard(it, L, nAcc), { ...base, cls: `c-list${it.guard && it.s.guard ? ' guardfill' : ''}`, acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'guard':
        return frame(guardCard(it, L), { ...base, cls: 'c-list', acc: accVar(it.k, nAcc), tag: tagOf(it) });
      case 'end':
        return frame(endCard(c, L, footnote), { ...base, cls: 'c-end', acc: accVar(0, nAcc), tag: L.recap, foot: brandFoot || credit });
    }
    return '';
  });

  const html = `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${esc(plain(c.title).replace(/\n/g, ' '))} · cards</title>
<style>${fontsStyle()}</style>
<style>${componentsCss}</style>
<style>${layoutCss}</style>
<style>${themeCss}</style>
</head><body><main class="sheet r-${R.slug}" style="--card-w:${R.w}px;--card-h:${R.h}px">
${cards.join('\n')}
</main>
<script>
// Fit each card (also runs when this file is opened directly):
// 1) scale every figure canvas to the space its card leaves for it;
// 2) if the card still overflows, or its figure would be too small to read, hide optional
//    elements ([data-drop]) in ascending order and record what was dropped in data-dropped.
window.__fit = function () {
  function scale(root) {
    root.querySelectorAll('.c-fig-box').forEach(function (box) {
      var cv = box.querySelector('.fig-canvas');
      if (!cv) return;
      var bw = box.clientWidth, bh = box.clientHeight, cw = cv.offsetWidth, ch = cv.offsetHeight;
      if (!bw || !bh) { box.dataset.scale = '0'; return; }
      var z = Math.max(0.3, Math.min(1.6, bw / cw, bh / ch));
      cv.style.transform = 'translate(' + ((bw - cw * z) / 2).toFixed(1) + 'px, ' + ((bh - ch * z) / 2).toFixed(1) + 'px) scale(' + z.toFixed(3) + ')';
      box.dataset.scale = z.toFixed(2);
    });
  }
  // Cover titles: as large as possible while keeping the author's line breaks.
  document.querySelectorAll('.cv-title').forEach(function (t) {
    t.style.fontSize = '';
    var want = t.querySelectorAll('br').length + 1;
    var size = parseFloat(getComputedStyle(t).fontSize);
    var lh = function () { return parseFloat(getComputedStyle(t).lineHeight) || size * 1.16; };
    while (size > 36 && t.getBoundingClientRect().height > want * lh() + 2) {
      size -= 2; t.style.fontSize = size + 'px';
    }
  });
  document.querySelectorAll('.card').forEach(function (card) {
    var body = card.querySelector('.c-body');
    var drops = Array.prototype.slice.call(card.querySelectorAll('[data-drop]'));
    drops.forEach(function (e) { e.hidden = false; });
    drops.sort(function (a, b) { return a.dataset.drop - b.dataset.drop; });
    scale(card);
    function bad() {
      if (body.scrollHeight > body.clientHeight + 1) return true;
      var box = card.querySelector('.c-fig-box');
      return !!(box && !box.closest('[hidden]') && Number(box.dataset.scale) < 1);
    }
    // 溢出按四档阶梯处理，不做一刀切隐藏：
    //   ① ≤40px：整卡内容块整体上移一点（.nudge）
    //   ② 40–90px：压块间距（.tight）
    //   ③ 90–160px：收标题字号（[data-shrink] → .shrink）
    //   ④ 160+ 或前三档无效：才开始删可选内容（[data-drop]）
    // 用了哪一档写进 data-fit，QA 会报出来——让人知道这张卡是"排出来的"还是"削出来的"。
    var shr = card.querySelectorAll('[data-shrink]');
    shr.forEach(function (e) { e.classList.remove('shrink'); });
    body.classList.remove('tight', 'nudge');
    var fitTier = '';
    function overPx() {
      return Math.max(0, body.scrollHeight - body.clientHeight);
    }
    var over0 = overPx();
    if (over0 > 0) {
      if (over0 <= 40) { body.classList.add('nudge'); fitTier = 'nudge'; }
      else if (over0 <= 90) { body.classList.add('tight'); fitTier = 'tight'; }
      else if (over0 <= 160) { body.classList.add('tight'); shr.forEach(function (e) { e.classList.add('shrink'); }); fitTier = 'tight+shrink'; }
    }
    if (bad()) {
      if (!body.classList.contains('tight') && over0 > 0) { body.classList.add('tight'); fitTier = (fitTier ? fitTier + '+' : '') + 'tight'; }
      if (bad() && !shr.length) { /* 没有可收的标题，直接进删内容 */ }
      if (bad() && fitTier.indexOf('shrink') < 0 && shr.length) { shr.forEach(function (e) { e.classList.add('shrink'); }); fitTier = (fitTier ? fitTier + '+' : '') + 'shrink'; }
    }
    var dropped = [];
    for (var i = 0; i < drops.length && bad(); i++) {
      drops[i].hidden = true;
      dropped.push(drops[i].dataset.dropName);
      scale(card);
    }
    if (dropped.length) fitTier = (fitTier ? fitTier + '+' : '') + 'drop';
    card.dataset.fit = fitTier;
    card.dataset.dropped = dropped.join('、');
  });
};
window.__fit();
document.fonts.ready.then(window.__fit);
</script>
</body></html>`;
  return { html, count: total };
}

// 小红书 titles are capped at 20 characters. Count every character as 1 (letters and spaces too)
// and cut at a natural break rather than mid-word.
export const xhsLen = (t) => [...String(t || '')].length;
function autoTitle(t) {
  const s = plain(t).replace(/\n/g, '').trim();
  if (xhsLen(s) <= 20) return s;
  const ch = [...s].slice(0, 20);
  // Prefer punctuation boundaries, then whitespace.
  for (const re of [/[：:，,、·—|｜]/, /\s/]) {
    for (let i = ch.length - 1; i >= 8; i--) if (re.test(ch[i])) return ch.slice(0, i).join('').trim();
  }
  return ch.slice(0, 19).join('') + '…';
}

/** Text for the 小红书 post itself (title, body, tags). */
export function buildCaption(c, count) {
  const x = c.xhs || {};
  const title = x.title || autoTitle(c.cover?.title || c.title);
  let body = x.caption;
  if (!body) {
    const heads = (c.pages || []).flatMap((p) => (p.sections || []).map((s) => plain(s.heading).replace(/\n/g, '')));
    body = [plain(c.pages?.[0]?.intro || ''), '', ...heads.map((h, i) => `${pad2(i + 1)} ${h}`)].join('\n');
  }
  // 小红书 hashtags end at whitespace, so strip it inside each tag.
  const tags = (x.tags || []).map((t) => '#' + String(t).replace(/^#/, '').replace(/\s+/g, '')).join(' ');
  // Hand-written captions credit the author themselves; only the auto summary gets a source line.
  const src = !x.caption && c.source
    ? `内容整理自 ${[c.source.author, c.source.handle && `（${c.source.handle}）`].filter(Boolean).join('')}${c.source.title ? `《${c.source.title}》` : ''}`
    : '';
  return [
    '# 标题', '', title, '',
    '# 正文', '', body.trim(), '', src, '', tags, '',
    '---', `图片：card-01.png … card-${pad2(count)}.png，按顺序上传。`,
    x.caption ? '' : '（正文为自动生成：建议在 content.json 的 xhs 字段里写一版更适合小红书的文案。）',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
