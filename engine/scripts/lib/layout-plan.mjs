// Layout plan preview (--plan): read content.json, decide a card-by-card layout intent,
// draw a schematic contact sheet, and stop before any real rendering.
//
// The plan reuses planCards() from layout-card.mjs, so the sheet always has exactly as many
// cards as a real render would produce. What it adds on top is the *role* of each card
// (claim / compare / process / evidence / stat / quote / checklist / sec) plus density,
// and three group-level constraints that a real render can only enforce later:
//   1) at least 3 distinct card kinds in one set,
//   2) no two adjacent cards of the same kind,
//   3) figure cards <= 40%.
// A section may carry `"role": "claim"` to state its intent; otherwise inferRole() guesses.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { planCards, buildCards } from './layout-card.mjs';
import { settleRole } from './role-map.mjs';
import { GATES } from './metrics.mjs';
import { launchBrowser } from './chrome.mjs';

const ROLE_CN = {
  cover: '封面',
  claim: '主张',
  compare: '对比',
  timeline: '时间线',
  process: '过程',
  evidence: '证据',
  stat: '数据',
  fig: '图证',
  quote: '引语',
  list: '要点',
  checklist: '清单',
  opener: '章节页',
  sec: '常规',
  end: '收尾',
};

const plain = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*?|__?|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// 卡型裁决统一走 role-map.mjs（与成图共用一份），这里不再自己猜一遍。

function charCount(s, card) {
  const text = plain(card.text ?? (s.paragraphs || [])[0] ?? '');
  const bullets = (card.bullets || []).map(plain);
  const stages = (s.stages || []).reduce((a, st) =>
    a + [...plain(st?.title)].length + [...plain(st?.done)].length
      + (st?.items || []).reduce((b, t) => b + [...plain(t)].length, 0), 0);
  const guard = (s.guard?.items || []).reduce((a, t) => a + [...plain(t)].length, 0)
    + [...plain(s.guard?.title)].length + [...plain(s.guard?.note)].length;
  return text.length + bullets.reduce((a, b) => a + b.length, 0) + plain(s.takeaway).length + stages + guard;
}

function hasFigure(s, card, part) {
  const figs = s.figures || [];
  if (!figs.length) return false;
  if (card.figure === 'none') return false;
  if (part === 2) return figs.length > 1;
  return true;
}

/** Turn the render plan into a design plan: one entry per card a real render would make. */
export function planLayout(content, ratio = '3:4') {
  const plan = planCards(content, ratio, 0);
  const cards = plan.map((it, i) => {
    const idx = i + 1;
    const base = { idx, kind: it.kind };
    if (it.kind === 'cover') {
      const pages = content.pages || [];
      const points = content.cover?.points?.length ?? (pages.length > 1 ? pages.length : (pages[0]?.sections || []).length);
      return { ...base, role: 'cover', roleCn: ROLE_CN.cover, title: plain(content.cover?.title || content.title), fig: false, chars: 0, density: 'light', note: `目录 ${points} 条` };
    }
    if (it.kind === 'end') {
      return { ...base, role: 'end', roleCn: ROLE_CN.end, title: plain(content.closing?.title || content.end?.title || '收尾'), fig: false, chars: 0, density: 'light', note: '一句收束' };
    }
    const s = it.s;
    const card = s.card || {};
    if (it.kind === 'stages' || it.kind === 'guard') {
      const role = it.kind === 'guard' ? 'checklist' : 'process';
      const steps = it.kind === 'guard' ? 0 : (s.stages || []).slice(it.from, it.to).length;
      return { ...base, role, roleCn: ROLE_CN[role], title: plain(s.heading), fig: false, chars: charCount(s, card), density: 'heavy', group: it.num, note: it.kind === 'guard' ? `${(s.guard?.items || []).length} 条护栏` : `${steps} 步${it.first ? '' : '（续）'}` };
    }
    const ROLE_KIND = { claim: 'claim', compare: 'compare', timeline: 'timeline', stat: 'stat', opener: 'opener', fig: 'fig' };
    if (ROLE_KIND[it.kind]) {
      const role = it.kind;
      const chars = role === 'claim'
        ? [...plain(s.claim?.text ?? card.text ?? (s.paragraphs || [])[0] ?? '')].length
        : role === 'fig'
          ? [...plain(card.text ?? (s.figures || [])[0]?.caption ?? (s.paragraphs || [])[0] ?? '')].length
          : role === 'compare'
          ? [...((s.compare?.left?.items || []).join('') + (s.compare?.right?.items || []).join(''))].length
          : role === 'timeline'
            ? (s.timeline || []).reduce((a, t) => a + [...plain(t.title)].length + [...plain(t.note)].length, 0)
            : role === 'stat'
              ? (s.stats || []).reduce((a, x) => a + [...plain(x?.value)].length + [...plain(x?.unit)].length + [...plain(x?.label)].length + [...plain(x?.note)].length, 0)
              : [...plain(s.heading)].length;
      const light = role === 'claim' || role === 'opener';
      // 容量上限（metrics.mjs DENSITY 的口径）：超了不是排得下就行，而是这页装了两页的内容。
      const over = [];
      if (role === 'claim') {
        const t = [...plain(s.claim?.text ?? card.text ?? (s.paragraphs || [])[0] ?? '')].length;
        if (t > 30) over.push(`主张 ${t} 字（上限 26–30）`);
        const nt = [...plain(s.claim?.note ?? s.takeaway)].length;
        if (nt > 40) over.push(`补充 ${nt} 字（上限 40）`);
      }
      if (role === 'compare') {
        const n = Math.max((s.compare?.left?.items || []).length, (s.compare?.right?.items || []).length);
        if (n > 4) over.push(`对比 ${n} 行（上限 4 行）`);
      }
      if (role === 'timeline' && (s.timeline || []).length > 6) over.push(`时间线 ${(s.timeline || []).length} 节点（上限 6）`);
      if (role === 'stat' && (s.stats || []).length > 3) over.push(`数字 ${(s.stats || []).length} 个（上限 3）`);
      if (role === 'opener' && [...plain(s.heading)].length > 12) over.push(`章节标题 ${[...plain(s.heading)].length} 字（上限 12）`);
      if (role === 'fig' && chars > 40) over.push(`图说明 ${chars} 字（上限 40）`);
      const notes = {
        claim: '一句主张，无图',
        compare: `${(s.compare?.left?.items || []).length} 对 ${(s.compare?.right?.items || []).length} 条`,
        timeline: `${(s.timeline || []).length} 个节点`,
        stat: `${(s.stats || []).length} 个数字`,
        opener: '章节页，留白',
        fig: '图 + 说明',
      };
      return { ...base, role, roleCn: ROLE_CN[role], title: plain(s.heading), fig: role === 'fig' || role === 'evidence', chars,
        density: light ? 'light' : 'medium', note: notes[role], group: it.num, over };
    }
    const role = settleRole(s, card);
    const declared = s.role === 'divider' ? 'opener' : (s.role || '');
    const downgrade = declared && declared !== role ? declared : '';
    const fig = hasFigure(s, card, it.part);
    const chars = charCount(s, card);
    const heavy = fig || s.panel || (card.bullets || []).length >= 3;
    const density = heavy ? (chars > 110 ? 'heavy' : 'medium') : chars > 90 ? 'medium' : 'light';
    const note = [fig ? '图' : '', s.panel ? '面板' : '', (card.bullets || []).length ? `${card.bullets.length} 要点` : '', s.takeaway ? '结论' : ''].filter(Boolean).join('·') || '纯文字';
    return { ...base, role, roleCn: ROLE_CN[role] || role, title: plain(s.heading), fig, chars, density, note, group: it.num, part: it.part, downgrade };
  });

  const inner = cards.filter((c) => c.role !== 'cover' && c.role !== 'end');
  const kinds = [...new Set(inner.map((c) => c.role))];
  // A checklist or a split section legitimately continues onto the next card: same `group`,
  // not a repetition of the same layout idea.
  const adj = [];
  for (let i = 1; i < cards.length; i++) {
    const a = cards[i - 1];
    const b = cards[i];
    if (a.role === b.role && !(a.group != null && a.group === b.group)) adj.push([a.idx, b.idx]);
  }
  const figN = inner.filter((c) => c.fig).length;
  const figRatio = inner.length ? figN / inner.length : 0;
  const lightRoles = ['claim', 'opener', 'quote'];
  const lightN = inner.filter((c) => lightRoles.includes(c.role)).length;
  const needLight = Math.ceil(inner.length / 4);
  // A card with almost nothing on it can only be centred and hoped for; the real fix is content.
  // 只判"靠正文撑场"的卡：主张/章节页/引文/数据/图证本来就是少字卡，字少不是病（图证的主体是图）。
  const thin = inner.filter((c) => !['claim', 'opener', 'quote', 'stat', 'fig'].includes(c.role) && c.chars > 0 && c.chars < 45);
  // 写了 role 但证据撑不起来：会被降级成常规卡，必须在灰模阶段就让人看见。
  const downgraded = inner.filter((c) => c.downgrade);
  // 超出容量上限：这页装了两页的内容，排得下也是挤的。
  const overCap = inner.filter((c) => (c.over || []).length);
  const gates = [
    kinds.length >= 3
      ? { ok: true, msg: `整组 ${kinds.length} 种卡型（${kinds.map((k) => ROLE_CN[k] || k).join('、')}）` }
      : { ok: false, msg: `整组只有 ${kinds.length} 种卡型（${kinds.map((k) => ROLE_CN[k] || k).join('、') || '无'}），至少要有 3 种` },
    adj.length === 0
      ? { ok: true, msg: '相邻卡片没有同型，节奏成立' }
      : { ok: false, msg: `相邻同型 ${adj.length} 处：${adj.map((p) => `${p[0]}/${p[1]}`).join('、')}` },
    figRatio <= 0.4
      ? { ok: true, msg: `图卡 ${figN}/${inner.length}（${Math.round(figRatio * 100)}%），不超过 40%` }
      : { ok: false, msg: `图卡 ${figN}/${inner.length}（${Math.round(figRatio * 100)}%），超过 40%：删掉一部分 figure，或在改写时写 "figure": "none"` },
    lightN >= needLight
      ? { ok: true, msg: `轻卡 ${lightN} 张（主张/章节页），每 ${Math.round(inner.length / Math.max(1, lightN))} 张一张呼吸卡` }
      : { ok: false, msg: `轻卡只有 ${lightN} 张，${inner.length} 张内容卡至少要 ${needLight} 张：至少一节标 "role": "claim" 或 "opener"` },
    inner.length <= 12
      ? { ok: true, msg: `内容卡 ${inner.length} 张，在 12 张以内` }
      : { ok: false, msg: `内容卡 ${inner.length} 张，超过建议上限 12 张（小红书 18 张也读不完）` },
    thin.length === 0
      ? { ok: true, msg: '每张卡都有足够的内容，不会出现大留白' }
      : { ok: false, msg: `内容太薄的卡 ${thin.map((c) => `${c.idx}（${ROLE_CN[c.role] || c.role}·${c.chars}字）`).join('、')}：把相邻薄节并成一张，或补一句说明——不要靠调间距凑版式` },
    downgraded.length === 0
      ? { ok: true, msg: '每节声明的 role 都有证据撑着，不会被降级' }
      : { ok: false, msg: `role 撑不起来被降级的卡 ${downgraded.map((c) => `${c.idx}（写了 ${c.downgrade}，实际 ${ROLE_CN[c.role] || c.role}）`).join('、')}：要么补证据，要么改成它实际的样子` },
    overCap.length === 0
      ? { ok: true, msg: '没有超出容量上限的卡' }
      : { ok: false, msg: `超出容量上限 ${overCap.map((c) => `${c.idx}（${c.over.join('；')}）`).join('、')}：拆卡或删内容，不要靠缩字号` },
  ];
  return { ratio, cards, stats: { total: cards.length, inner: inner.length, kinds: kinds.length, figN, figRatio }, gates };
}

// ---- 逐卡实测：J在真卡、真尺寸上量覆盖率与空带，不截图 ------------------------
// 灰模用的就是成图那份 HTML（buildCards 产出），所以这里量出来的数，和成图期
// qaInPage 量的是同一件事——区别只是这一步不写图片，几秒出全部数字，
// 于是"哪张卡发空"能在出图之前看到，而不是出完图再逐张肉眼。
function measurePlanCards() {
  const out = [];
  document.querySelectorAll('[data-card]').forEach((card) => {
    const body = card.querySelector('.c-body');
    if (!body) return;
    const br = body.getBoundingClientRect();
    const H = br.height;
    const rects = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.data.trim()) continue;
      if (n.parentElement && n.parentElement.closest('[hidden]')) continue;
      range.selectNodeContents(n);
      for (const rc of range.getClientRects()) {
        if (rc.width < 1 || rc.height < 1) continue;
        rects.push([rc.top - br.top, rc.bottom - br.top]);
      }
    }
    for (const el of body.querySelectorAll('img, .fig-canvas')) {
      if (el.closest('[hidden]')) continue;
      const e = el.getBoundingClientRect();
      if (!e.width) continue;
      rects.push([e.top - br.top, e.bottom - br.top]);
    }
    let cov = 0;
    let maxGap = H;
    let gapAt = 0;
    let head = H;
    let tail = H;
    if (rects.length) {
      rects.sort((a, b) => a[0] - b[0]);
      const bands = [];
      for (const [t, b] of rects) {
        const last = bands[bands.length - 1];
        if (last && t - last[1] <= 3) last[1] = Math.max(last[1], b);
        else bands.push([t, b]);
      }
      head = bands[0][0];
      const lastB = bands[bands.length - 1][1];
      cov = H ? (lastB - head) / H : 0;
      maxGap = 0;
      for (let i = 1; i < bands.length; i++) {
        const g = bands[i][0] - bands[i - 1][1];
        if (g > maxGap) { maxGap = g; gapAt = bands[i - 1][1] / H; }
      }
      tail = Math.max(0, H - lastB);
    }
    out.push({
      idx: Number(card.dataset.card), cov, H, gap: maxGap, gapRatio: H ? maxGap / H : 0,
      gapAt, head, tail,
      over: Math.max(0, body.scrollHeight - body.clientHeight),
      fit: card.dataset.fit || '', dropped: card.dataset.dropped || '',
    });
  });
  return out;
}

const CENTRED = new Set(['claim', 'opener', 'timeline', 'stat', 'list', 'end']);

/** 把实测数字挂回每张卡，并合成一条"逐卡空档"闸门。 */
export function attachMeasure(plan, rows) {
  const by = new Map((rows || []).map((r) => [r.idx, r]));
  const pct = (x) => Math.round(x * 1000) / 10;
  const hits = [];
  for (const c of plan.cards) {
    const r = by.get(c.idx);
    if (!r) continue;
    c.cov = pct(r.cov);
    c.gap = pct(r.gapRatio);
    c.gapAt = r.gapAt < 0.34 ? '上段' : r.gapAt < 0.67 ? '中段' : '下段';
    c.headGap = Math.round(r.head / 2); // 输出像素（渲染 scale=2）
    c.tailGap = Math.round(r.tail / 2);
    c.fit = r.fit;
    c.over = Math.round(r.over / 2) * 2;
    const centred = CENTRED.has(c.role);
    const cover = c.role === 'cover';
    let level = '';
    let msg = '';
    const GAP_WARN = GATES.gapWarn * 100;   // 15%
    const GAP_ERR = GATES.gapError * 100;   // 22.5%
    const OPEN_WARN = GATES.openerGapWarn * 100; // 30%
    const COV_WARN = GATES.coverageWarn * 100;   // 78%
    const COV_ERR = GATES.coverageError * 100;   // 70%
    if (cover) {
      if (c.gap >= 28) { level = 'error'; msg = `封面${c.gapAt}空 ${c.gap}%`; }
      else if (c.gap >= 20) { level = 'warn'; msg = `封面${c.gapAt}空 ${c.gap}%`; }
    } else if (c.role === 'opener') {
      if (c.gap >= OPEN_WARN) { level = 'warn'; msg = `章节页${c.gapAt}空 ${c.gap}%`; }
      else if (r.H && Math.abs(r.head - r.tail) / r.H > 0.10) { level = 'warn'; msg = `章节页上下不均（上 ${Math.round(r.head)} / 下 ${Math.round(r.tail)}）`; }
    } else if (centred) {
      if (c.gap >= GAP_ERR) { level = 'error'; msg = `${c.gapAt}空 ${c.gap}%`; }
      else if (c.gap >= GAP_WARN) { level = 'warn'; msg = `${c.gapAt}空 ${c.gap}%`; }
      else if (r.H && Math.abs(r.head - r.tail) / r.H > 0.10) { level = 'warn'; msg = `上下不均（上 ${Math.round(r.head)} / 下 ${Math.round(r.tail)}）`; }
    } else {
      if (c.cov < COV_ERR) { level = 'error'; msg = `只占 ${c.cov}%`; }
      else if (c.cov < COV_WARN) { level = 'warn'; msg = `只占 ${c.cov}%`; }
      if (!level && c.gap >= GAP_ERR) { level = 'error'; msg = `${c.gapAt}空 ${c.gap}%`; }
      else if (!level && c.gap >= GAP_WARN) { level = 'warn'; msg = `${c.gapAt}空 ${c.gap}%`; }
    }
    if (!level && r.over > 1) { level = 'warn'; msg = `超出 ${Math.round(r.over / 2)}px`; }
    if (!level && /(shrink|drop)/.test(c.fit)) { level = 'warn'; msg = `靠${/drop/.test(c.fit) ? '删内容' : '收字号'}才装下`; }
    if (level) { c.level = level; hits.push({ card: c, level, msg }); }
  }
  const errs = hits.filter((h) => h.level === 'error');
  const warns = hits.filter((h) => h.level === 'warn');
  const text = (list) => list.map((h) => `${h.card.idx}（${h.card.roleCn}·${h.msg}）`).join('、');
  plan.gates.push({
    ok: errs.length === 0,
    level: errs.length ? 'error' : warns.length ? 'warn' : 'ok',
    msg: errs.length
      ? `逐卡实测：${errs.length} 张明显发空 — ${text(errs)}${warns.length ? `；另有 ${warns.length} 张偏空 — ${text(warns)}` : ''}`
      : warns.length
        ? `逐卡实测：没有明显发空，${warns.length} 张偏紧/偏空 — ${text(warns)}`
        : `逐卡实测：每张卡的空带都在上限以内（内容卡 ≥78%、章节页 ≤30%）`,
  });
  return plan;
}

// ---- schematic sheet -----------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Deterministic bar widths so the sketch reads as text without pretending to be the real page.
const bar = (seed, i, min, max) => min + ((seed * 37 + i * 61) % (max - min + 1));

function lines(seed, n, range = [62, 96]) {
  return Array.from({ length: n }, (_, i) => `<div class="ln" style="width:${bar(seed, i, range[0], range[1])}%"></div>`).join('');
}

function sketch(c) {
  const seed = c.idx;
  const head = c.title ? `<div class="ttl">${esc(c.title.length > 18 ? c.title.slice(0, 18) + '…' : c.title)}</div>` : '';
  switch (c.role) {
    case 'cover':
      return `<div class="kicker"></div><div class="big">${esc(c.title || '')}</div><div class="rule"></div>${lines(seed, 4, [48, 80])}`;
    case 'claim':
      return `${head}<div class="claim-txt">${lines(seed, 3, [70, 95])}</div><div class="rule short"></div>`;
    case 'compare':
      return `${head}<div class="cols"><div class="col">${lines(seed, 3, [60, 92])}</div><div class="col">${lines(seed + 7, 3, [60, 92])}</div></div>`;
    case 'process':
      return `${head}<div class="nodes">${Array.from({ length: 4 }, (_, i) => `<div class="node"><i>${String(i + 1).padStart(2, '0')}</i>${lines(seed + i, 2, [55, 90])}</div>`).join('')}</div>`;
    case 'stat':
      return `${head}<div class="stats"><div class="numph"></div><div class="numph sm"></div></div>${lines(seed, 2, [50, 78])}`;
    case 'evidence':
      return `${head}<div class="figbox">图</div>${lines(seed, 2, [62, 94])}`;
    case 'fig':
      return `${head}<div class="figbox hero">图</div><div class="ln" style="width:78%;margin:0 auto"></div>`;
    case 'checklist':
      return `${head}${Array.from({ length: 4 }, (_, i) => `<div class="chk"><em>✓</em><span class="ln" style="width:${bar(seed, i, 62, 96)}%"></span></div>`).join('')}<div class="guard">✕ 护栏</div>`;
    case 'list':
      return `${head}${lines(seed, 3, [56, 92])}<div class="bullets">${Array.from({ length: 3 }, () => '<div class="bl"></div>').join('')}</div>`;
    case 'timeline':
      return `${head}<div class="nodes">${Array.from({ length: 4 }, (_, i) => `<div class="node"><i>·</i>${lines(seed + i, 2, [50, 88])}</div>`).join('')}</div>`;
    case 'opener':
      return `<div class="open"><div class="open-no"></div><div class="open-h">${esc(c.title || '')}</div><div class="rule short"></div>${lines(seed, 2, [46, 72])}</div>`;
    case 'end':
      return `<div class="endline">${esc(c.title || '')}</div><div class="rule short"></div>`;
    default:
      return `${head}${lines(seed, 3, [66, 98])}${c.fig ? '<div class="figbox sm">图</div>' : ''}<div class="take"></div>`;
  }
}

export function planHtml(plan, { spec, theme, ratio }) {
  const W = 300;
  const H = Math.round((W * spec.h) / spec.w);
  const body = plan.cards
    .map(
      (c) => `<figure class="card ${c.role} ${c.density}${c.level ? ' ' + c.level : ''}">
  <div class="meta"><b>${String(c.idx).padStart(2, '0')}</b><span class="chip">${esc(c.roleCn)}</span><span class="dim">${esc(c.density)}</span></div>
  <div class="cv" style="width:${W}px;height:${H}px">${sketch(c)}</div>
  <figcaption>${esc(c.title || '—')}<i>${esc(c.note)}${c.chars ? ` · ${c.chars} 字` : ''}${c.cov != null ? (c.role === 'claim' || c.role === 'timeline' || c.role === 'stat' || c.role === 'opener' || c.role === 'end' ? ` · 空 ${c.gap}%` : ` · 覆盖 ${c.cov}% 空 ${c.gap}%`) : ''}</i></figcaption>
</figure>`
    )
    .join('\n');
  const gates = plan.gates.map((g) => `<li class="${!g.ok ? 'bad' : g.level === 'warn' ? 'warn' : 'ok'}">${!g.ok ? '✗' : g.level === 'warn' ? '⚠' : '✓'} ${esc(g.msg)}</li>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>版式方案 · ${esc(ratio)} · ${esc(theme)}</title>
<style>
  :root{--ink:#111;--muted:#777;--rule:#D9D9D9;--bg:#F1F1F0;--card:#fff}
  *{box-sizing:border-box}
  body{margin:0;padding:40px 44px 56px;background:var(--bg);color:var(--ink);
    font:14px/1.55 'Inter','Noto Sans SC','Microsoft YaHei',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  header{display:flex;gap:26px;align-items:flex-end;border-bottom:1px solid var(--rule);padding-bottom:14px;margin-bottom:26px}
  h1{margin:0;font-size:22px;letter-spacing:0;font-weight:700}
  .sub{color:var(--muted);font-size:12px;letter-spacing:.02em}
  ul.gates{margin:0;padding:0;list-style:none;color:var(--muted);font-size:12px;margin-left:auto}
  ul.gates li{margin:2px 0}
  ul.gates li.ok{color:#1F7A48}
  ul.gates li.warn{color:#A9762A}
  ul.gates li.bad{color:#B23A2A}
  .sheet{display:flex;flex-wrap:wrap;gap:22px}
  figure.card{margin:0;width:300px}
  figure.card.warn .cv{outline:1px solid #C98A3C;outline-offset:-1px}
  figure.card.error .cv{outline:2px solid #B23A2A;outline-offset:-2px}
  figure.card.warn .dim,figure.card.error .dim{color:#B23A2A}
  .meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);margin-bottom:7px;letter-spacing:.02em}
  .meta b{color:var(--ink);font-size:13px}
  .chip{border:1px solid var(--rule);border-radius:99px;padding:1px 8px;color:var(--ink);background:#fff}
  .dim{margin-left:auto;text-transform:uppercase;letter-spacing:.08em}
  .cv{background:var(--card);border:1px solid var(--rule);padding:18px 16px;display:flex;flex-direction:column;gap:9px;overflow:hidden}
  figcaption{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.5}
  figcaption i{display:block;color:#9A9A9A;font-style:normal}
  .ln{height:7px;background:#E3E3E3;border-radius:2px}
  .rule{height:2px;background:var(--ink);width:100%}
  .rule.short{width:46px}
  .kicker{height:6px;width:38%;background:var(--ink)}
  .big{font-size:24px;font-weight:700;line-height:1.25;letter-spacing:0}
  .ttl{font-size:15px;font-weight:700;line-height:1.35}
  .claim-txt{display:flex;flex-direction:column;gap:10px;margin:auto 0}
  .claim-txt .ln{height:14px;background:#DCDCDC}
  .cols{display:flex;gap:12px}
  .col{flex:1;display:flex;flex-direction:column;gap:7px;border-top:2px solid var(--ink);padding-top:10px}
  .nodes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .node{border-left:2px solid var(--ink);padding-left:8px;display:flex;flex-direction:column;gap:5px}
  .node i{font-weight:700;font-size:10px;letter-spacing:.06em;font-style:normal;color:var(--muted)}
  .stats{display:flex;gap:16px;align-items:baseline}
  .num{font-size:40px;font-weight:700;line-height:1;letter-spacing:-.02em}
  .numph{width:98px;height:46px;background:#E2E2E2;border-radius:3px}
  .numph.sm{width:62px;height:28px;margin-bottom:9px}
  .figbox{border:1px dashed #C9C9C9;background:#F7F7F7;color:#B0B0B0;display:flex;align-items:center;justify-content:center;font-size:11px;height:120px;letter-spacing:.2em}
  .figbox.sm{height:74px}
  .figbox.hero{height:52%;min-height:150px}
  .chk{display:flex;align-items:center;gap:8px}
  .chk em{font-style:normal;font-size:11px;color:var(--ink)}
  .chk .ln{flex:0 0 auto}
  .guard{margin-top:auto;border:1px solid var(--rule);border-left:3px solid var(--ink);padding:7px 9px;font-size:11px;color:#666}
  .bullets{display:flex;flex-direction:column;gap:7px;margin-top:2px}
  .bl{height:5px;background:#EDEDED;border-radius:2px;width:70%}
  .endline{font-size:18px;font-weight:700;margin:auto 0}
  .take{margin-top:auto;height:22px;background:var(--ink);width:72%}
  .open{margin:auto 0;display:flex;flex-direction:column;gap:9px}
  .open-no{width:74px;height:44px;background:#E2E2E2;border-radius:3px}
  .open-h{font-size:20px;font-weight:700;line-height:1.3}
</style></head><body>
<header>
  <div><h1>版式方案 · ${esc(ratio)} · ${esc(theme)}</h1>
  <div class="sub">${plan.stats.total} 张卡 / 内容卡 ${plan.stats.inner} 张 / ${plan.stats.kinds} 种卡型 · 灰模只示意版式与信息量，不代表最终配色</div></div>
  <ul class="gates">${gates}</ul>
</header>
<div class="sheet">${body}</div>
</body></html>`;
}

/** --plan: 量出每张卡的空带、写 plan.html / plan.png / plan.json，不出任何成图。 */
export async function runPlan({
  content, ratio, spec, baseOut, theme, htmlOnly = false,
  brand, themeCss, componentsCss, layoutCss, nAcc, scale = 2,
}) {
  const plan = planLayout(content, ratio);
  const dir = path.join(baseOut, `plan-${spec.slug}`);
  fs.mkdirSync(dir, { recursive: true });

  // 逐卡实测：把成图那份真卡 HTML 跑到浏览器里量一遍（不截图、不写卡图），
  // 量完把数字挂回每张卡，灰模与文案里都能看到"这页会不会空"。
  let browser = null;
  if (!htmlOnly && brand && themeCss) {
    const mPath = path.join(dir, '_measure.html');
    fs.writeFileSync(mPath, buildCards({ content, brand, themeCss, componentsCss, layoutCss, nAcc, ratio }).html);
    browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport(spec.w, Math.round(spec.h * 1.15), 1);
      await page.goto(pathToFileURL(mPath).href);
      await page.settle(8000);
      attachMeasure(plan, await page.evaluate(measurePlanCards));
    } finally {
      await page.close();
    }
  }

  const htmlPath = path.join(dir, 'plan.html');
  fs.writeFileSync(htmlPath, planHtml(plan, { spec, theme, ratio }));
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));

  for (const c of plan.cards) {
    const m = c.cov != null ? `覆盖 ${String(Math.round(c.cov)).padStart(3, ' ')}%  空 ${String(Math.round(c.gap)).padStart(2, ' ')}%` : '              ';
    console.log(`${String(c.idx).padStart(2, '0')}  ${(ROLE_CN[c.role] || c.role).padEnd(4, '　')} ${c.density.padEnd(6)} ${c.fig ? '图卡' : '　　'}  ${m}  ${c.chars ? c.chars + ' 字' : ''}  ${c.title || ''}`.trimEnd());
  }
  console.log('');
  for (const g of plan.gates) console.log(`  ${!g.ok ? '✗' : g.level === 'warn' ? '⚠' : '✓'} ${g.msg}`);

  let png;
  if (!htmlOnly) {
    const page = await browser.newPage();
    try {
      await page.setViewport(1500, 1000, 1.50);
      await page.goto(pathToFileURL(htmlPath).href);
      await page.settle(8000);
      const size = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet');
        const box = sheet.getBoundingClientRect();
        const pad = 44;
        return { width: Math.ceil(box.right + pad), height: Math.ceil(document.body.scrollHeight) };
      });
      await page.setViewport(size.width, size.height, 1.50);
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height: size.height }, format: 'png' });
      png = path.join(dir, 'plan.png');
      fs.writeFileSync(png, buf);
    } finally {
      await page.close();
      await browser.close();
    }
  }
  console.log(`\n版式方案 → ${htmlPath}${png ? `\n灰模图 → ${png}` : ''}`);
  const bad = plan.gates.filter((g) => !g.ok).length;
  const warn = plan.gates.filter((g) => g.ok && g.level === 'warn').length;
  console.log(`\n${bad
    ? `✗ ${bad} 条不通过${warn ? `、⚠ ${warn} 条待看` : ''}：先回去改内容或卡型，再出图。`
    : warn
      ? `✓ 硬约束全过，⚠ ${warn} 条待看：这些卡出图后大概率还要回来改，建议先处理。`
      : '✓ 全部通过，确认后即可渲染。'}`);
  return bad ? 1 : 0;
}
