// Scene templates for the explainer video. Each builder returns { html, events, counters, karaoke }.
// Times are absolute (seconds on the final video). Animations are named presets played by the stage script:
//   rise · pop · stamp · wipe · grow · draw · mark · pulse · check · fade
// An element animates when the narration reaches its cue word (resolved from character timestamps).
import { esc } from '../markup.mjs';
import { plainText } from './text.mjs';

const md = (s) => esc(String(s ?? '')).replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

// Numbers keep the precision they are written with: 98.7 must never round to 99. `decimals` overrides when the
// script wants a fixed precision (98.70).
const CJK = /[\u4e00-\u9fa5]/;
const decOf = (v) => {
  const s = String(v ?? '');
  const k = s.indexOf('.');
  return k >= 0 ? s.length - k - 1 : 0;
};
const fmtNum = (v, dec = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** " 小时" is a unit set beside the figure at a smaller size; "%" stays welded to the digits. */
const splitSuffix = (t) => {
  const s = String(t ?? '');
  return CJK.test(s) ? { sym: '', unit: s.trim() } : { sym: s, unit: '' };
};

/** Cue resolver for one scene: cue text → absolute time of its first spoken character. */
export function cueResolver(sceneAlign, offset, fallbackStart, fallbackEnd) {
  const lines = sceneAlign?.lines || [];
  return function at(cue, { line, frac, end = false } = {}) {
    if (cue != null && cue !== '') {
      const cs = String(cue);
      const order = line != null ? [line, ...lines.map((_, i) => i).filter((i) => i !== line)] : lines.map((_, i) => i);
      for (const li of order) {
        const l = lines[li];
        if (!l) continue;
        const k = l.text.indexOf(cs);
        if (k >= 0 && l.chars[k]) return offset + (end ? l.chars[k + cs.length - 1][1] : l.chars[k][0]);
      }
    }
    if (line != null && lines[line]?.start != null) return offset + (end ? lines[line].end : lines[line].start);
    return fallbackStart + (fallbackEnd - fallbackStart) * (frac ?? 0);
  };
}

const CHECK = '<svg viewBox="0 0 24 24" class="ic"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" class="ic"><path d="M7 7l10 10M17 7L7 17" pathLength="1"/></svg>';

let uid = 0;
const id = (p) => `${p}${++uid}`;

const B = {
  number(s, at, win) {
    const ev = [], counters = [];
    const lab = id('n'), st = id('n'), num = id('n'), badge = id('n'), img = id('n');
    const dec = Number.isFinite(Number(s.decimals)) ? Math.max(0, Number(s.decimals)) : decOf(s.to);
    const { sym, unit } = splitSuffix(s.suffix);
    const tCount = at(s.count_cue ?? String(s.to));
    if (s.label) ev.push({ id: lab, p: 'rise', t: win.in + 0.05 });
    if (s.start_text) ev.push({ id: st, p: 'rise', t: Math.max(win.in + 0.1, at(s.start_text.slice(-3)) - 0.15) });
    // The figure flips in on its own axis rather than popping: a counter that lands reads as a fact, not a bubble.
    ev.push({ id: num, p: 'flip', t: tCount - 0.12 });
    counters.push({ id: `${num}v`, from: Number(s.from) || 0, to: Number(s.to), t: tCount - 0.05, dur: 0.95, prefix: s.prefix || '', suffix: sym, dec });
    if (s.badge) ev.push({ id: badge, p: 'stamp', t: at(s.badge_cue ?? s.badge) });
    const imgT = s.image ? Math.max(tCount + 0.5, at(s.image.cue, { end: true }) + 0.2) : 0;
    if (s.image) ev.push({ id: img, p: 'pop', t: imgT });
    const fmt = (v) => `${s.prefix || ''}${fmtNum(v, dec)}${sym}`;
    return {
      events: ev, counters,
      html:
        `<div class="sc-number">` +
        (s.label ? `<div class="v-label" id="${lab}">${md(s.label)}</div>` : '') +
        (s.start_text ? `<div class="v-from" id="${st}"><span>${md(s.start_text)}</span><i class="v-arrow">↓</i></div>` : '') +
        `<div class="v-big" id="${num}"><span id="${num}v">${esc(fmt(s.from ?? 0))}</span>` +
        (unit ? `<em class="v-unit">${esc(unit)}</em>` : '') +
        (s.badge ? `<em class="v-badge" id="${badge}">${md(s.badge)}</em>` : '') + `</div>` +
        (s.image ? `<figure class="v-proof" id="${img}"><img src="${esc(s.image.src)}" alt="">${s.image.note ? `<figcaption>${md(s.image.note)}</figcaption>` : ''}</figure>` : '') +
        `</div>`,
    };
  },

  list(s, at, win) {
    const ev = [];
    const tags = (s.tags || []).map((tg) => {
      const i = id('t');
      ev.push({ id: i, p: 'pop', t: at(tg.cue ?? tg.text) });
      ev.push({ id: `${i}x`, p: 'grow', t: at(tg.cue ?? tg.text) + 0.35 });
      return `<span class="v-tag" id="${i}">${md(tg.text)}<i class="v-strike" id="${i}x"></i></span>`;
    }).join('');
    const ti = id('t');
    if (s.title) ev.push({ id: ti, p: 'rise', t: (s.tags || []).length ? at(s.title_cue, { line: s.title_line }) - 0.1 : win.in + 0.08 });
    const items = (s.items || []).map((it, k) => {
      const i = id('i');
      ev.push({ id: i, p: 'rise', t: at(it.cue ?? it.text) + (it.delay || 0) });
      return `<li class="v-item" id="${i}"><b class="v-no">${k + 1}</b><span>${md(it.text)}</span></li>`;
    }).join('');
    return {
      events: ev,
      html: `<div class="sc-list">${tags ? `<div class="v-tags">${tags}</div>` : ''}${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<ol class="v-items">${items}</ol></div>`,
    };
  },

  timeline(s, at, win) {
    const ev = [];
    const ti = id('t'), line = id('l');
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.05 });
    const pts = (s.points || []).map((p) => ({ ...p, t: at(p.cue ?? p.label) }));
    ev.push({ id: line, p: 'grow-y', t: pts[0]?.t ?? win.in, dur: Math.max(0.6, (pts[pts.length - 1]?.t ?? win.in) - (pts[0]?.t ?? win.in) + 0.4) });
    const html = pts.map((p) => {
      const i = id('p');
      ev.push({ id: i, p: 'rise', t: p.t - 0.05 });
      ev.push({ id: `${i}d`, p: p.low ? 'pulse' : 'pop', t: p.t });
      return `<li class="v-pt${p.low ? ' low' : ''}" id="${i}"><i class="v-dot" id="${i}d"></i><b>${md(p.label)}</b><span>${md(p.note || '')}</span></li>`;
    }).join('');
    return { events: ev, html: `<div class="sc-timeline">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<div class="v-tl"><i class="v-tl-line" id="${line}"></i><ol>${html}</ol></div></div>` };
  },

  merge(s, at, win) {
    const ev = [];
    const ti = id('t'), tg = id('g'), chart = id('c');
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.05 });
    const n = (s.sources || []).length;
    const srcs = (s.sources || []).map((x, k) => {
      const i = id('s');
      const t = at(x.cue ?? x.text);
      ev.push({ id: i, p: 'pop', t });
      ev.push({ id: `${i}a`, p: 'draw', t: t + 0.15 });
      const x0 = Math.round(((k + 0.5) / n) * 438);
      return { chip: `<span class="v-src" id="${i}">${md(x.text)}</span>`, path: `<path id="${i}a" d="M${x0} 4 C ${x0} 60, 219 52, 219 112" pathLength="1"/>` };
    });
    const tt = at(s.target_cue ?? s.target);
    ev.push({ id: tg, p: 'stamp', t: tt });
    ev.push({ id: chart, p: 'draw', t: tt + 0.1, dur: 0.9 });
    return {
      events: ev,
      html:
        `<div class="sc-merge">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}` +
        `<div class="v-srcs">${srcs.map((x) => x.chip).join('')}</div>` +
        `<svg class="v-arrows" viewBox="0 0 438 120">${srcs.map((x) => x.path).join('')}</svg>` +
        `<div class="v-target" id="${tg}">${md(s.target)}<svg class="v-spark" viewBox="0 0 120 40"><path id="${chart}" d="M2 36 L30 32 L52 30 L70 22 L90 12 L118 3" pathLength="1"/></svg></div>` +
        `</div>`,
    };
  },

  compare(s, at, win) {
    const ev = [];
    const ti = id('t');
    // The title is on screen from the start (no empty openings); it pulses when the narration says it.
    if (s.title) { ev.push({ id: ti, p: 'rise', t: win.in + 0.08 }); if (s.title_cue) ev.push({ id: ti, p: 'focus', t: at(s.title_cue, { line: 0 }) }); }
    const col = (c, good) => {
      const ci = id('c');
      const items = (c.items || []).map((it) => {
        const i = id('i');
        const t = at(it.cue ?? it.text) + (it.delay || 0);
        ev.push({ id: i, p: 'rise', t });
        ev.push({ id: `${i}k`, p: 'check', t: t + 0.12 });
        return `<li id="${i}"><i class="v-mk" id="${i}k">${good ? CHECK : CROSS}</i><span>${md(it.text)}</span></li>`;
      }).join('');
      const first = Math.min(...(c.items || []).map((it) => at(it.cue ?? it.text) + (it.delay || 0)));
      ev.push({ id: ci, p: 'rise', t: (Number.isFinite(first) ? first : win.in) - 0.25 });
      return `<div class="v-col ${good ? 'good' : 'bad'}" id="${ci}"><h3>${md(c.title)}</h3><ul>${items}</ul></div>`;
    };
    return { events: ev, html: `<div class="sc-compare">${s.title ? `<h2 class="v-title big" id="${ti}">${md(s.title)}</h2>` : ''}<div class="v-cols">${col(s.left, true)}${col(s.right, false)}</div></div>` };
  },

  stats(s, at, win) {
    const ev = [], counters = [];
    const ti = id('t'), no = id('n');
    if (s.title) { ev.push({ id: ti, p: 'rise', t: win.in + 0.08 }); if (s.title_cue) ev.push({ id: ti, p: 'focus', t: at(s.title_cue, { line: 0 }) }); }
    const items = (s.items || []).map((it) => {
      const i = id('s');
      const dec = Number.isFinite(Number(it.decimals)) ? Math.max(0, Number(it.decimals)) : decOf(it.value);
      const { sym, unit } = splitSuffix(it.suffix);
      const t = at(it.cue ?? String(it.value));
      ev.push({ id: i, p: 'pop', t: t - 0.15 });
      counters.push({ id: `${i}v`, from: 0, to: Number(it.value), t: t - 0.1, dur: 0.8, prefix: it.prefix || '', suffix: sym, dec });
      return `<div class="v-stat" id="${i}"><b id="${i}v">${esc((it.prefix || '') + fmtNum(0, dec) + sym)}</b>${unit ? `<i class="v-unit sm">${esc(unit)}</i>` : ''}<span>${md(it.label)}</span></div>`;
    }).join('');
    if (s.note) ev.push({ id: no, p: 'pop', t: at(s.note_cue ?? s.note) });
    return { events: ev, counters, html: `<div class="sc-stats">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<div class="v-stat-list">${items}</div>${s.note ? `<div class="v-note" id="${no}">${md(s.note)}</div>` : ''}</div>` };
  },

  quote(s, at, win, sa, offset) {
    const ev = [];
    const qi = id('q'), by = id('b');
    ev.push({ id: qi, p: 'fade', t: win.in + 0.05 });
    // Characters light up as they are spoken (karaoke), using the timestamps of `quote_line`.
    const li = s.quote_line ?? (sa?.lines?.length ? sa.lines.length - 1 : 0);
    const line = sa?.lines?.[li];
    const text = plainText(s.quote ?? line?.text ?? '');
    const karaoke = [];
    let k0 = 0;
    const spans = [...text].map((ch) => {
      if (ch === '\n') return '<br>';
      const i = id('k');
      let t = win.in + 0.4;
      if (line) {
        const pos = line.text.indexOf(ch, k0);
        if (pos >= 0 && line.chars[pos]) { t = offset + line.chars[pos][0]; k0 = pos + 1; }
      }
      karaoke.push({ id: i, t });
      return `<span id="${i}">${esc(ch)}</span>`;
    }).join('');
    const end = karaoke.length ? karaoke[karaoke.length - 1].t : win.in + 1;
    ev.push({ id: by, p: 'rise', t: end + 0.2 });
    return { events: ev, karaoke, html: `<div class="sc-quote"><div class="v-qmark">“</div><blockquote class="v-quote" id="${qi}">${spans}</blockquote>${s.by ? `<div class="v-by" id="${by}">— ${md(s.by)}</div>` : ''}</div>` };
  },

  checklist(s, at, win) {
    const ev = [];
    const ti = id('t'), cta = id('c');
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.05 });
    const items = (s.items || []).map((it) => {
      const i = id('i');
      const t = at(it.cue ?? it.text);
      ev.push({ id: i, p: 'rise', t: t - 0.2 });
      ev.push({ id: `${i}k`, p: 'check', t: t + 0.05 });
      ev.push({ id: `${i}s`, p: 'mark', t: t + 0.1 });
      return `<li id="${i}"><i class="v-box"><i id="${i}k">${CHECK}</i></i><span id="${i}s">${md(it.text)}</span></li>`;
    }).join('');
    if (s.cta) { ev.push({ id: cta, p: 'pop', t: at(s.cta_cue ?? s.cta) }); ev.push({ id: cta, p: 'pulse', t: at(s.cta_cue ?? s.cta) + 0.9 }); }
    return { events: ev, html: `<div class="sc-check">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<ul class="v-checks">${items}</ul>${s.cta ? `<div class="v-cta" id="${cta}">${md(s.cta)}</div>` : ''}</div>` };
  },

  /** A number over time: the figure plus a drawn line. The visual weight a 45-second video otherwise lacks. */
  trend(s, at, win) {
    const ev = [], counters = [];
    const ti = id('t'), fig = id('n'), line = id('l'), area = id('a'), last = id('d');
    const vals = (s.values || []).map(Number).filter((v) => Number.isFinite(v));
    const data = vals.length >= 2 ? vals : [Number(s.from ?? 0), Number(s.to ?? 0)];
    const dec = Number.isFinite(Number(s.decimals)) ? Math.max(0, Number(s.decimals)) : decOf(data[data.length - 1]);
    const { sym, unit } = splitSuffix(s.suffix);
    const t = at(s.count_cue ?? String(data[data.length - 1]));
    const W = 438, H = 150, pad = 10;
    const max = Math.max(...data), min = Math.min(...data, 0);
    const x = (k) => pad + (k * (W - pad * 2)) / (data.length - 1);
    const y = (v) => H - 26 - ((v - min) / Math.max(1, max - min)) * (H - 52);
    const pts = data.map((v, k) => `${x(k).toFixed(1)} ${y(v).toFixed(1)}`);
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.06 });
    ev.push({ id: fig, p: 'flip', t: t - 0.12 });
    counters.push({ id: `${fig}v`, from: 0, to: data[data.length - 1], t: t - 0.05, dur: 1.1, prefix: s.prefix || '', suffix: sym, dec });
    ev.push({ id: area, p: 'fade', t: t + 0.1 });
    ev.push({ id: line, p: 'draw', t: t + 0.05, dur: 1.0 });
    const dots = data.slice(0, -1).map((v, k) => {
      const i = id('d');
      ev.push({ id: i, p: 'pop', t: t + 0.05 + k * 0.22 });
      const pos = `left:${((x(k) / W) * 100).toFixed(1)}%;top:${((y(v) / H) * 100).toFixed(1)}%`;
      return `<i class="v-dot" id="${i}" style="${pos}"></i>`;
    }).join('');
    ev.push({ id: last, p: 'pulse', t: t + 1.05 });
    const lastPos = `left:${((x(data.length - 1) / W) * 100).toFixed(1)}%;top:${((y(data[data.length - 1]) / H) * 100).toFixed(1)}%`;
    const labels = (s.labels || []).map((l, k) => `<span style="left:${((x(k) / W) * 100).toFixed(1)}%">${esc(l)}</span>`).join('');
    return {
      events: ev, counters,
      html:
        `<div class="sc-trend">` +
        (s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : '') +
        `<div class="v-big sm" id="${fig}"><span id="${fig}v">${esc((s.prefix || '') + fmtNum(0, dec) + sym)}</span>${unit ? `<em class="v-unit">${esc(unit)}</em>` : ''}</div>` +
        `<div class="v-chart">` +
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
        `<polygon class="v-area" id="${area}" points="${pts.join(' ')} ${x(data.length - 1).toFixed(1)} ${H - 12} ${pad} ${H - 12}"/>` +
        `<polyline class="v-line" id="${line}" points="${pts.join(' ')}"/>` +
        `</svg>` +
        `<div class="v-dots">${dots}<i class="v-dot last" id="${last}" style="${lastPos}"></i></div>` +
        `<div class="v-xlabels">${labels}</div>` +
        `</div>` +
        (s.note ? `<div class="v-note">${md(s.note)}</div>` : '') +
        `</div>`,
    };
  },

  /** Ranked bars: several quantities compared by length, each growing when the narration reaches it. */
  bars(s, at, win) {
    const ev = [];
    const ti = id('t');
    const items = s.items || [];
    const vals = items.map((it) => Number(it.value) || 0);
    const max = Number(s.max) || Math.max(...vals, 1);
    // Precision is per value (15 stays 15%, 98.7 keeps its one decimal) unless the scene forces one for all.
    const sceneDec = Number.isFinite(Number(s.decimals)) ? Math.max(0, Number(s.decimals)) : null;
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.06 });
    const rows = items.map((it) => {
      const i = id('b'), bar = id('b');
      const t = at(it.cue ?? it.label);
      const dec = sceneDec ?? (Number.isFinite(Number(it.decimals)) ? Math.max(0, Number(it.decimals)) : decOf(it.value));
      ev.push({ id: i, p: 'rise', t: t - 0.15 });
      ev.push({ id: bar, p: 'grow', t: t, dur: 0.55 });
      const pct = Math.max(2, Math.min(100, (Number(it.value) / max) * 100));
      const { sym, unit } = splitSuffix(it.suffix);
      return `<li class="v-bar" id="${i}"><b>${md(it.label)}</b><span class="v-bar-track"><i class="v-bar-fill" id="${bar}" style="width:${pct.toFixed(1)}%"></i></span><em>${esc(fmtNum(it.value, dec) + sym)}${unit ? ` <small>${esc(unit)}</small>` : ''}</em></li>`;
    }).join('');
    return { events: ev, html: `<div class="sc-bars">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<ul class="v-bars">${rows}</ul></div>` };
  },

  title(s, at, win) {
    const ev = [];
    const ti = id('t'), sub = id('s'), img = id('m');
    ev.push({ id: ti, p: 'rise', t: win.in + 0.05 });
    // Keywords (**…**) get a marker sweep when spoken.
    let k = 0;
    const html = md(s.title || plainText(s.lines?.[0] || '')).replace(/<b>([\s\S]+?)<\/b>/g, (m, w) => {
      const i = `${ti}k${k++}`;
      const wt = at(w.replace(/<[^>]+>/g, ''));
      ev.push({ id: i, p: 'mark', t: wt });
      // A light passes over the keyword once as it is said: the eye lands on the word the ear just heard.
      ev.push({ id: `${i}s`, p: 'sweep', t: wt + 0.12, dur: 0.55 });
      return `<b id="${i}">${w}<i class="v-sheen" id="${i}s"></i></b>`;
    });
    if (s.sub) ev.push({ id: sub, p: 'rise', t: at(s.sub_cue, { line: 1 }) });
    if (s.image) ev.push({ id: img, p: 'pop', t: at(s.image.cue, { frac: 0.3 }) });
    return {
      events: ev,
      html: `<div class="sc-title"><h2 class="v-headline" id="${ti}">${html}</h2>${s.sub ? `<p class="v-sub" id="${sub}">${md(s.sub)}</p>` : ''}${s.image ? `<figure class="v-illo" id="${img}"><img src="${esc(s.image.src)}" alt=""></figure>` : ''}</div>`,
    };
  },

  image(s, at, win) {
    const ev = [];
    const ti = id('t'), img = id('m'), cap = id('c');
    if (s.title) ev.push({ id: ti, p: 'rise', t: win.in + 0.05 });
    ev.push({ id: img, p: 'pop', t: at(s.cue, { frac: 0.05 }) });
    if (s.caption) ev.push({ id: cap, p: 'rise', t: at(s.caption_cue, { frac: 0.4 }) });
    return { events: ev, html: `<div class="sc-image">${s.title ? `<h2 class="v-title" id="${ti}">${md(s.title)}</h2>` : ''}<figure class="v-photo" id="${img}"><img src="${esc(s.src)}" alt=""></figure>${s.caption ? `<p class="v-sub" id="${cap}">${md(s.caption)}</p>` : ''}</div>` };
  },
};

export const SCENE_TYPES = Object.keys(B);

export function buildScene(s, ctx) {
  const fn = B[s.type];
  if (!fn) throw new Error(`未知镜头类型 ${s.type}（可用：${SCENE_TYPES.join('、')}）`);
  return fn(s, ctx.at, ctx.win, ctx.align, ctx.offset);
}
