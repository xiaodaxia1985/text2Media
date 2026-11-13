// Render a director's script (video.json) + narration alignment into a 1080×1920 MP4.
// Deterministic: every animation is a paused Web Animation; each frame seeks the whole page to t and is captured.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from '../chrome.mjs';
import { esc } from '../markup.mjs';
import { fontsStyle } from '../fonts.mjs';
import { buildScene, cueResolver } from './scenes.mjs';
import { captionPhrases, plainText } from './text.mjs';
import { renderSfx } from './sfx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..', '..', '..');
const readCss = (n) => fs.readFileSync(path.join(SKILL, 'layouts', n), 'utf8');

export const TIMING = { coverHold: 0.5, coverFade: 0.25, voiceLead: 0.05, tail: 1.6, sceneLead: 0.2, fps: 30 };

/** Frame-capture is one DevTools roundtrip per frame; several pages over the same deterministic timeline scale
 *  better than one page doing them in order. Kept modest: each page is a full 1080×1920 compositor. */
export function defaultWorkers() {
  const cores = os.cpus()?.length || 4;
  return Math.max(1, Math.min(3, Math.floor(cores / 4)));
}

/** Caption look for a theme: a preset from layouts/video.css plus --cap-* variables (themes/caption-styles.json). */
export function captionStyle(theme, override) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(SKILL, 'themes', 'caption-styles.json'), 'utf8')); } catch {}
  const base = map[theme] || map.default || { style: 'pill' };
  const style = override?.style || base.style;
  const vars = { ...(override?.style && override.style !== base.style ? {} : base.vars || {}), ...(override?.vars || {}) };
  return { style, css: Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';') };
}

const md = (s) => esc(String(s ?? '')).replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

/** Keyword ranges (from **markup**) in plain-text coordinates. */
function keyRanges(line) {
  const out = [];
  let plain = 0;
  String(line).split(/(\*\*[^*]+\*\*)/).forEach((p) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) { out.push([plain, plain + p.length - 4]); plain += p.length - 4; } else plain += p.length;
  });
  return out;
}

function captionHtml(text, from, ranges) {
  let html = '';
  [...text].forEach((ch, k) => {
    const pos = from + k;
    const key = ranges.some(([a, b]) => pos >= a && pos < b);
    html += key ? `<b>${esc(ch)}</b>` : esc(ch);
  });
  return html.replace(/<\/b><b>/g, '');
}

/** Build the timeline and the stage HTML. */
export function buildStage(video, align, themeCss, opts = {}) {
  const T = { ...TIMING, ...(opts.timing || {}) };
  const VO = T.coverHold + T.coverFade + T.voiceLead; // narration starts here
  const nAcc = Math.max(1, new Set(themeCss.match(/--accent-\d+\s*:/g) || []).size);
  // Statement scenes (a quote, the closing list) carry the brand colour instead of a
  // rotating accent: a hue that appears for three seconds at the very end reads as a mistake.
  const STATEMENT = new Set(['quote', 'checklist']);
  const acc = (k, type) => (STATEMENT.has(type) ? 'var(--accent-2)' : `var(--accent-${(k % nAcc) + 1})`);
  const total = +(VO + align.duration + T.tail).toFixed(3);
  const scenes = video.scenes;
  const sa = (sc) => align.scenes.find((a) => a.id === sc.id);
  const starts = scenes.map((sc, i) => (i === 0 ? T.coverHold + T.coverFade : VO + (sa(sc)?.start ?? 0) - T.sceneLead));

  const events = [], counters = [], karaoke = [], captions = [], fxLayers = [];
  // Inter-scene transitions, ported from the HyperFrames cover-transition catalog (transitions-cover / -radial / -light).
  // A layer covers the cut, the scenes swap underneath it, then the layer leaves the other way. Without a declaration
  // the film keeps its mask/fade rhythm; "transitions": "wipe" (or a list, repeating) replaces those boundaries.
  const FX = {
    wipe: { kind: 'cover', n: 2, inDur: .26, inStagger: .09, outDur: .26, outStagger: .09 },
    blinds: { kind: 'cover', n: 8, inDur: .2, inStagger: .035, outDur: .22, outStagger: .035 },
    iris: { kind: 'cover', n: 1, inDur: .34, inStagger: 0, outDur: .3, outStagger: 0 },
    flash: { kind: 'cover', n: 1, inDur: .16, inStagger: 0, outDur: .16, outStagger: 0 },
    // Slide moves animate the frames themselves instead of covering the cut (catalog: transitions-push / -scale).
    // `squeeze` is deliberately absent: scaling a frame squashes the type, and the type is the design here.
    push: { kind: 'slide', preset: 'push-x', dur: .52 },
    'push-y': { kind: 'slide', preset: 'push-y', dur: .52 },
    // Elastic push: the incoming card overshoots slightly and settles, so the cut lands with a beat.
    bounce: { kind: 'slide', preset: 'bounce', dur: .62 },
  };
  const fxDecl = video.transitions ?? video.transition;
  const fxList = (Array.isArray(fxDecl) ? fxDecl : fxDecl ? [fxDecl] : []).filter((x) => FX[x]);
  const fxAt = (b) => (fxList.length ? fxList[fxList.length > 1 ? b % fxList.length : 0] : null);
  const plan = scenes.map((sc, i) => (i + 1 < scenes.length ? fxAt(i) : null));
  const slideIn = (name) => (name ? `${FX[name].preset}-in` : null);
  const slideOut = (name) => (name ? `${FX[name].preset}-out` : null);
  const sceneHtml = scenes.map((sc, i) => {
    const win = { in: starts[i], out: i + 1 < scenes.length ? starts[i + 1] : total };
    const a = sa(sc);
    const at = cueResolver(a, VO, win.in + 0.3, win.out - 0.3);
    const built = buildScene(sc, { at, win, align: a, offset: VO });
    const sid = `sc${i}`;
    // Content scenes sit on the image-card surface; headline/image scenes stay full-bleed so the video keeps a rhythm.
    const sheet = sc.type !== 'title' && sc.type !== 'image';
    const fxName = i + 1 < scenes.length ? plan[i] : null;
    const fx = fxName ? FX[fxName] : null;
    const inFx = i > 0 ? plan[i - 1] : null;
    const inSlide = inFx && FX[inFx].kind === 'slide' ? slideIn(inFx) : null;
    // A pushed frame arrives while the previous one leaves: both slide over the same half second.
    events.push({ id: sid, p: inSlide || 'scene-in', t: inSlide ? win.in - FX[inFx].dur / 2 : win.in });
    if (fx && fx.kind === 'slide') {
      events.push({ id: sid, p: slideOut(fxName), t: win.out - fx.dur / 2 });
    } else if (fx) {
      // Covered at the cut: in-layer built so it is opaque just before the next scene starts, swap under it,
      // then the layer sweeps away while the next scene's own entrance plays behind it.
      const covered = win.out - 0.02;
      const inTotal = fx.inDur + (fx.n - 1) * fx.inStagger;
      const t0 = covered - inTotal;
      const tOut = covered + 0.1;
      const layers = [];
      for (let k = 0; k < fx.n; k++) {
        const id = fxName === 'iris' ? `fx${i}i` : fxName === 'flash' ? `fx${i}f` : `fx${i}${fxName === 'wipe' ? 'p' : 'b'}${k}`;
        const p = fxName === 'flash' ? 'fx-flash' : fxName === 'iris' ? 'fx-iris' : 'fx-cover';
        events.push({ id, p: `${p}-in`, t: t0 + k * fx.inStagger, dur: fx.inDur });
        events.push({ id, p: `${p}-out`, t: tOut + k * fx.outStagger, dur: fx.outDur });
        layers.push({ id, k });
      }
      fxLayers.push({ i, name: fxName, n: fx.n, layers });
      events.push({ id: sid, p: 'hide', t: covered });
    } else if (i + 1 < scenes.length) events.push({ id: sid, p: sheet ? 'mask-out' : 'scene-out', t: win.out - 0.3 });
    events.push({ id: `${sid}cam`, p: 'cam', t: win.in, dur: win.out - win.in });
    for (const e of built.events) events.push({ ...e, scene: i, t: Math.max(win.in + 0.06, Math.min(e.t, win.out - 0.3)), raw: e.t });
    for (const c of built.counters || []) counters.push({ ...c, t: Math.max(win.in + 0.06, c.t) });
    for (const k of built.karaoke || []) karaoke.push(k);
    if (sc.chip) events.push({ id: `${sid}chip`, p: 'pop', t: win.in + 0.02 });
    // Captions: phrases of each line, timed by the first and last spoken character.
    // A scene whose whole point is one big sentence on screen (quote) can turn them off:
    // otherwise the same words show twice, once huge and once at the bottom.
    (sc.captions === false ? [] : (a?.lines || [])).forEach((l, li) => {
      const ranges = keyRanges(sc.lines[li]);
      for (const ph of captionPhrases(sc.lines[li])) {
        const s = l.chars[ph.from]?.[0], e = l.chars[Math.max(ph.from, ph.to - 1)]?.[1];
        if (s == null || !ph.text) continue;
        captions.push({ t: VO + s - 0.04, end: VO + e, html: captionHtml(ph.text, ph.from, ranges), scene: i });
      }
    });
    const digit = sc.deco ?? (String(sc.chip || '').match(/\d+/) || [])[0];
    // 背景装饰只做"第 N 件事"的大号数字；没有章节数字就留白——早先那团模糊圆斑在
    // 浅色主题上看着像一块脏阴影，已去掉（2026-11-13）。
    const deco = digit ? `<div class="v-deco num" id="${sid}deco">${esc(digit)}</div>` : '';
    if (digit) {
      events.push({ id: `${sid}deco`, p: 'drift', t: win.in, dur: win.out - win.in });
      // Chapter beat: the numeral opens the scene strong, then recedes when the content starts arriving.
      const first = Math.min(...built.events.map((e) => e.t).filter((t) => t > win.in + 0.3), win.out);
      events.push({ id: `${sid}deco`, p: 'recede', t: Math.max(win.in + 0.6, first - 0.35) });
    }
    // Content scenes sit on the image-card surface; headline/image scenes stay full-bleed so the video keeps a rhythm.
    return (
      `<section class="v-scene${sc.chip ? ' has-chip' : ''}${sheet ? ' sheet' : ''} acc" id="${sid}" style="--acc:${acc(i, sc.type)}">${deco}` +
      (sc.chip ? `<div class="v-chip" id="${sid}chip" style="top:-40px;left:0">${md(sc.chip)}</div>` : '') +
      `<div class="v-cam" id="${sid}cam">${built.html}</div></section>`
    );
  }).join('\n');
  const fxHtml = fxLayers.map(({ i, name, n, layers }) => {
    const inside = layers.map(({ id, k }) => {
      if (name === 'iris' || name === 'flash') return `<div class="fx-${name}" id="${id}"></div>`;
      if (name === 'wipe') return `<div class="fx-p${k + 1}" id="${id}"></div>`;
      return `<div class="fx-b" id="${id}" style="top:${(k * 100) / n}%;height:${100 / n}%"></div>`;
    }).join('');
    return `<div class="v-fx" style="--acc:${acc(i + 1, scenes[i + 1]?.type)}">${inside}</div>`;
  }).join('\n');
  captions.sort((a, b) => a.t - b.t);
  // A caption stays up through short pauses until the next one replaces it (a hard cut, no blinking gap);
  // only a real pause (> CAP_BRIDGE) clears the line, and then it fades out and the next fades in.
  const CAP_BRIDGE = 1.4;
  captions.forEach((c, k) => {
    const nx = captions[k + 1];
    c.until = nx && nx.t - c.end <= CAP_BRIDGE ? nx.t : (nx ? Math.min(nx.t - 0.3, c.end + 0.5) : c.end + 0.8);
    c.until = Math.max(c.until, Math.min(nx ? nx.t : Infinity, c.t + 0.6));
  });
  captions.forEach((c, k) => {
    const pv = captions[k - 1], nx = captions[k + 1];
    c.fadeIn = !pv || c.t - pv.until > 0.05;
    c.fadeOut = !nx || nx.t - c.until > 0.05;
  });
  const cap = captionStyle(opts.theme, video.captions);

  const cv = video.cover || {};
  const coverImg = opts.coverImage ? `<div class="v-cover-img"><img src="${esc(opts.coverImage)}" alt=""></div>` : '';
  const cover =
    `<section class="v-cover acc" id="cover" style="--acc:${acc(0)}">` +
    (cv.kicker ? `<div class="v-cover-k">${md(cv.kicker)}</div>` : '') +
    `<h1 class="v-cover-t">${md(cv.title || video.title || '')}</h1>${coverImg}` +
    `<div class="v-cover-ai">${esc(opts.aiLabel || 'AI 配音解读')}</div></section>`;
  events.push({ id: 'cover', p: 'cover-out', t: T.coverHold, dur: T.coverFade });

  // Per scene: when its last element appears and when it leaves (used to give viewers time to read).
  const sceneInfo = scenes.map((sc, i) => {
    const sid = `sc${i}`;
    const inT = starts[i], outT = i + 1 < scenes.length ? starts[i + 1] : total;
    const own = events.filter((e) => e.scene === i && !/^sc\d+(cam|chip|deco)?$/.test(e.id) && e.p !== 'pulse' && e.p !== 'focus');
    return { id: sc.id, in: inT, out: outT, lastReveal: own.length ? Math.max(...own.map((e) => e.raw ?? e.t)) : inT };
  });
  const data = { total, events, counters, karaoke, captions, captionStyle: cap.style };
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>video stage</title>
<style>${fontsStyle()}</style>
<style>${readCss('components.css')}</style>
<style>${readCss('video.css')}</style>
<style>${themeCss}</style>
<style>.page.stage{width:540px;height:960px;padding:0;margin:0}</style>
</head><body>
<main class="page stage acc" style="--acc:${acc(0)}">
<div class="v-progress"><i id="prog"></i></div>
<div class="v-credit">${esc(opts.credit || '')}</div>
${sceneHtml}
${fxHtml}
<div class="v-cap cap-${cap.style}" style="${esc(cap.css)}"><span class="c" id="cap" style="visibility:hidden"></span></div>
${cover}
</main>
<script>window.__TL = ${JSON.stringify(data)};</script>
<script>${STAGE_JS}</script>
</body></html>`;
  return { html, data, VO, total, sceneInfo };
}

// In-page player: named presets → paused Web Animations; __seek(t) moves everything to time t.
const STAGE_JS = String.raw`
(function () {
  const TL = window.__TL;
  const E = 'cubic-bezier(.2,.8,.2,1)', BACK = 'cubic-bezier(.34,1.56,.64,1)';
  const P = {
    'scene-in': [[{ opacity: 0, transform: 'translateY(34px)' }, { opacity: 1, transform: 'none' }], .38, E],
    'scene-out': [[{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-26px)' }], .26, 'ease-in'],
    // Card scenes leave behind a mask rather than a fade: the sheet wipes up and the next one arrives on a clean page.
    'mask-out': [[{ clipPath: 'inset(0 0 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 100% 0)', opacity: 1 }], .3, 'ease-in'],
    'cover-out': [[{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(1.06)', filter: 'blur(6px)' }], .25, 'ease-in'],
    // A scene that leaves instantly under a cover layer: no fade, the next scene's entrance does the work.
    hide: [[{ opacity: 1 }, { opacity: 0 }], .02, 'linear'],
    // Cover-transition layers (catalog: staggered colour blocks, blinds, iris, flash-through-white).
    'fx-cover-in': [[{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }], .26, 'cubic-bezier(.7,0,.2,1)'],
    'fx-cover-out': [[{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }], .26, 'cubic-bezier(.7,0,.2,1)'],
    'fx-iris-in': [[{ clipPath: 'circle(0% at 50% 42%)' }, { clipPath: 'circle(82% at 50% 42%)' }], .34, 'cubic-bezier(.6,.02,.2,1)'],
    'fx-iris-out': [[{ clipPath: 'circle(82% at 50% 42%)' }, { clipPath: 'circle(0% at 50% 42%)' }], .3, 'ease-in'],
    'fx-flash-in': [[{ opacity: 0 }, { opacity: 1 }], .16, 'ease-in'],
    'fx-flash-out': [[{ opacity: 1 }, { opacity: 0 }], .16, 'ease-out'],
    // Slide transitions: the frames themselves move, no cover layer (catalog: push slide / vertical push / squeeze).
    // Sections are inset by the safe area (438px of a 540px frame), so travel is in px of the frame: 100% of the\n    // element would leave a strip of the incoming sheet visible at the right edge.\n    // The in-presets carry opacity: a scene's base style is transparent (scene-in normally brings it up), so a
    // transform-only entrance would slide a blank sheet in.
    'push-x-in': [[{ transform: 'translateX(540px)', opacity: 1 }, { transform: 'translateX(0)', opacity: 1 }], .52, 'cubic-bezier(.65,0,.35,1)'],
    'push-x-out': [[{ transform: 'translateX(0)' }, { transform: 'translateX(-540px)' }], .52, 'cubic-bezier(.65,0,.35,1)'],
    'push-y-in': [[{ transform: 'translateY(960px)', opacity: 1 }, { transform: 'translateY(0)', opacity: 1 }], .52, 'cubic-bezier(.65,0,.35,1)'],
    'push-y-out': [[{ transform: 'translateY(0)' }, { transform: 'translateY(-960px)' }], .52, 'cubic-bezier(.65,0,.35,1)'],
    // Overshoot then settle: incoming at 92–97% of its travel already, easing back to 0.
    'bounce-in': [
      [{ transform: 'translateX(540px)', opacity: 1, offset: 0, easing: 'cubic-bezier(.12,.7,.3,1)' }, { transform: 'translateX(-24px)', opacity: 1, offset: .74, easing: 'cubic-bezier(.3,0,.2,1)' }, { transform: 'translateX(8px)', opacity: 1, offset: .88, easing: 'cubic-bezier(.4,0,.3,1)' }, { transform: 'translateX(0)', opacity: 1, offset: 1 }],
      .62,
      'linear',
    ],
    'bounce-out': [[{ transform: 'translateX(0)' }, { transform: 'translateX(-540px)' }], .5, 'cubic-bezier(.5,0,.5,1)'],
    cam: [[{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }], 1, 'linear'],
    drift: [[{ transform: 'translate(24px, 10px) scale(.94)' }, { transform: 'translate(-8px, -6px) scale(1.02)' }], 1, 'linear'],
    recede: [[{ opacity: .5 }, { opacity: .1 }], .5, 'ease-out'],
    rise: [[{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], .36, E],
    pop: [[{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: .7 }, { opacity: 1, transform: 'scale(1)' }], .42, E],
    // A figure that lands like a mechanical counter, on its own axis.
    flip: [[{ opacity: 0, transform: 'rotateX(-74deg)' }, { opacity: 1, transform: 'rotateX(8deg)', offset: .72 }, { opacity: 1, transform: 'rotateX(0deg)' }], .44, E],
    // One light passing over a keyword, timed to the word being spoken.
    sweep: [[{ transform: 'translateX(-120%)', opacity: 0 }, { transform: 'translateX(52%)', opacity: .85, offset: .45 }, { transform: 'translateX(220%)', opacity: 0 }], .55, 'ease-out'],
    stamp: [[{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], .26, 'ease-out'],
    fade: [[{ opacity: 0 }, { opacity: 1 }], .3, 'ease-out'],
    grow: [[{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], .32, E],
    'grow-y': [[{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], 1, 'linear'],
    draw: [[{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], .55, E],
    // Marker ink: revealed by a left-to-right clip rather than a dash (a dashed round cap would paint one fat dot).
    ink: [[{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], .62, 'cubic-bezier(.35,.02,.25,1)'],
    check: [[{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], .3, 'ease-out'],
    mark: [[{ backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%' }], .4, E],
    pulse: [[{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], .5, 'ease-in-out'],
    focus: [[{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }, { transform: 'scale(1)' }], .6, 'ease-in-out'],
  };
  const anims = [];
  for (const e of TL.events) {
    const el = document.getElementById(e.id);
    if (!el) continue;
    const [kf, dur, easing] = P[e.p];
    let target = el;
    if ((e.p === 'draw' || e.p === 'check') && el.tagName !== 'path') target = el.querySelector('path') || el;
    // Entrances hold their first frame before they start (fill both); exits and accents must not (forwards / none),
    // or an exit's first keyframe would show the element from t = 0.
    const exit = e.p === 'scene-out' || e.p === 'mask-out' || e.p === 'cover-out' || e.p === 'dim' || e.p === 'hide' || (e.p.startsWith('fx-') && e.p.endsWith('-out')) || e.p.endsWith('-out');
    const accent = e.p === 'pulse' || e.p === 'focus';
    const a = target.animate(kf, { duration: (e.dur || dur) * 1000, delay: e.t * 1000, easing, fill: accent ? 'none' : exit ? 'forwards' : 'both', composite: accent ? 'add' : 'replace' });
    a.pause();
    anims.push(a);
  }
  const cnt = TL.counters.map((c) => ({ ...c, el: document.getElementById(c.id) })).filter((c) => c.el);
  const kar = TL.karaoke.map((k) => ({ ...k, el: document.getElementById(k.id) })).filter((k) => k.el);
  const cap = document.getElementById('cap'), prog = document.getElementById('prog');
  const capMax = cap.parentElement.clientWidth;
  let capNow = null;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  // Titles are one line whenever they can be: shrink the type until the widest line fits the text box, so a nine-character
  // headline never wraps into an orphan glyph. Called once after the fonts settle; below 30px the line is balanced instead.
  window.__fit = function () {
    for (const el of document.querySelectorAll('.v-headline, .v-title, .v-cover-t')) {
      const box = el.parentElement;
      if (!box) continue;
      const avail = box.clientWidth - 2;
      el.style.fontSize = '';
      el.style.whiteSpace = 'nowrap';
      const size = parseFloat(getComputedStyle(el).fontSize);
      const w = el.scrollWidth;
      if (w > avail) {
        const fitted = Math.floor((size * avail) / w);
        if (fitted >= 30) el.style.fontSize = fitted + 'px';
        else { el.style.fontSize = '30px'; el.style.whiteSpace = ''; el.style.textWrap = 'balance'; }
      }
      el.style.whiteSpace = '';
    }
    // Big figures: shrink only when the figure itself is wider than its box (a long number, not a unit — units are
    // already set at .40em so "48 小时" never wraps).
    for (const el of document.querySelectorAll('.v-big')) {
      const avail = (el.parentElement || el).clientWidth - 4;
      el.style.fontSize = '';
      if (avail <= 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (el.scrollWidth > avail) el.style.fontSize = Math.max(56, Math.floor((size * avail) / el.scrollWidth)) + 'px';
    }
  };
  window.__seek = function (t) {
    for (const a of anims) a.currentTime = t * 1000;
    for (const c of cnt) {
      const x = Math.max(0, Math.min(1, (t - c.t) / c.dur));
      const v = Math.round((c.from + (c.to - c.from) * ease(x)) * Math.pow(10, c.dec || 0)) / Math.pow(10, c.dec || 0);
      c.el.textContent = c.prefix + v.toLocaleString('en-US', { minimumFractionDigits: c.dec || 0, maximumFractionDigits: c.dec || 0 }) + c.suffix;
    }
    for (const k of kar) {
      const x = Math.max(0, Math.min(1, (t - k.t) / .18));
      k.el.style.opacity = (0.18 + 0.82 * x).toFixed(3);
    }
    const c = TL.captions.find((c) => t >= c.t && t < c.until) || null;
    if (c !== capNow) {
      capNow = c;
      cap.innerHTML = c ? c.html : '';
      cap.style.visibility = c ? 'visible' : 'hidden';
      // One line, always: shrink the font if a phrase is wider than the caption band.
      cap.style.fontSize = '';
      if (c && cap.offsetWidth > capMax) cap.style.fontSize = (parseFloat(getComputedStyle(cap).fontSize) * capMax / cap.offsetWidth).toFixed(1) + 'px';
    }
    // No pop and no scale: a fade only when the line appears after silence or clears before one.
    if (c) {
      const fi = c.fadeIn ? Math.min(1, (t - c.t) / .14) : 1, fo = c.fadeOut ? Math.min(1, (c.until - t) / .18) : 1;
      cap.style.opacity = Math.max(0, Math.min(fi, fo)).toFixed(3);
    }
    prog.style.width = (100 * Math.min(1, t / TL.total)).toFixed(2) + '%';
    return true;
  };
  window.__seek(0);
})();
`;

/**
 * Frames of the encoded video in which a caption should be fully shown but the caption band is empty (the caption
 * flickers out for a frame). Measured on the real pixels: horizontal edge energy of the band, which text produces
 * and an empty band does not. Returns { frames: [frame numbers], checked } or null when it cannot measure.
 */
export function captionDropouts(mp4, captions, fps) {
  // .v-cap: left 30, right 72, top 676, height 64 CSS px on a 540×960 stage rendered at 2×.
  const W = 292, H = 32;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', `crop=876:128:60:1352,scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const n = W * H, total = Math.floor(r.stdout.length / n);
  const energy = (f) => {
    let e = 0;
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) e += Math.abs(r.stdout[f * n + y * W + x] - r.stdout[f * n + y * W + x - 1]);
    return e / n;
  };
  // Only frames where a caption is fully up (after its fade-in, before its fade-out).
  const want = [];
  for (let f = 0; f < total; f++) {
    const t = f / fps;
    if (captions.some((c) => t >= c.t + (c.fadeIn === false ? 0.04 : 0.2) && t <= c.until - (c.fadeOut === false ? 0.04 : 0.25))) want.push([f, energy(f)]);
  }
  if (!want.length) return { frames: [], checked: 0 };
  const sorted = want.map((w) => w[1]).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median < 0.5) return null; // nothing measurable in the band (e.g. captions off)
  return { frames: want.filter(([, e]) => e < median * 0.3).map(([f]) => f), checked: want.length };
}

function ff(args, opts = {}) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg 失败：${(r.stderr || '').slice(-800)}`);
  return r;
}

/** Two-pass loudnorm to I=-14 LUFS, TP=-1 dBTP (linear when possible). */
function loudnorm(input, output, filterPre, extraInputs = []) {
  const pre = filterPre ? `${filterPre},` : '';
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...extraInputs, '-i', input, '-filter_complex', `${pre}loudnorm=I=-14:TP=-1:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const j = JSON.parse((m.stderr.match(/\{[\s\S]*?\}/g) || ['{}']).pop());
  ff([...extraInputs, '-i', input, '-filter_complex', `${pre}loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`, '-ar', '48000', output]);
  return j;
}

/**
 * Render the video. Returns a report.
 * opts: { dir, theme, themeCss, credit, coverImage, narration, log, fps }
 */
export async function renderVideo(video, align, opts) {
  const log = opts.log || console.log;
  const fps = opts.fps || TIMING.fps;
  const out = opts.dir;
  fs.mkdirSync(path.join(out, 'review'), { recursive: true });
  const { html, data, VO, total } = buildStage(video, align, opts.themeCss, opts);
  const stagePath = path.join(out, 'stage.html');
  fs.writeFileSync(stagePath, html);

  const browser = await launchBrowser();
  const issues = [];
  let capDrops = null;
  try {
    const page = await browser.newPage();
    await page.setViewport(540, 960, 2);
    await page.goto(pathToFileURL(stagePath).href);
    const fontStatus = await page.settle(30000);
    if (fontStatus === 'timeout') issues.push({ level: 'warn', where: '字体', msg: '网络字体加载超时，可能用了回退字体' });
    await page.evaluate(() => window.__fit && window.__fit());

    // Layout QA at the end state of each scene: content must stay inside the content box, text must not overflow.
    const qa = await page.evaluate((tl) => {
      const res = [];
      const box = { l: 30, r: 540 - 72, t: 120, b: 662 };
      document.querySelectorAll('.v-scene').forEach((sc, i) => {
        const inEv = tl.events.find((e) => e.id === sc.id && e.p === 'scene-in');
        const outEv = tl.events.find((e) => e.id === sc.id && (e.p === 'scene-out' || e.p === 'mask-out' || e.p === 'hide' || e.p.endsWith('-out')));
        const t = outEv ? outEv.t - 0.05 : tl.total - 0.1;
        window.__seek(t);
        for (const el of sc.querySelectorAll('h2,h3,li,.v-big,.v-item,.v-stat,.v-target,.v-src,.v-cta,.v-tag,.v-proof,.v-quote,.v-note,.v-col,.v-pt')) {
          const r = el.getBoundingClientRect();
          if (r.width < 1) continue;
          const over = Math.max(box.l - r.left, r.right - box.r, box.t - r.top, r.bottom - box.b);
          const camSlack = 12; // the slow push-in (scale 1.035 of the 438×528 content box) may move edges outward by ~8–10 px
          if (over > camSlack) res.push({ scene: i, el: (el.className || el.tagName) + ' ' + el.textContent.trim().slice(0, 16), over: Math.round(over) });
        }
        void inEv;
      });
      window.__seek(0);
      return res;
    }, data);
    for (const q of qa) issues.push({ level: 'error', where: `第 ${q.scene + 1} 镜`, msg: `「${q.el}」超出安全区 ${q.over}px` });

    // Audio beds (rendered by WebAudio in the same browser).
    // Audio: narration plus soft transition whooshes (background music is not part of this release).
    const sfxPath = path.join(out, 'sfx.wav');
    const whooshes = data.events.filter((e) => e.p === 'scene-in').map((e) => e.t).filter((t) => t > 1);
    await renderSfx(page, { seconds: total, whooshes, out: sfxPath });

    // Frames → ffmpeg, in parallel slices. Capture is one DevTools roundtrip per frame, so several pages each owning
    // a contiguous run of the timeline keep the compositor busy instead of queueing behind one page; the slices are
    // concatenated losslessly afterwards. Deterministic because every page seeks to absolute times.
    const silentMp4 = path.join(out, 'video-silent.mp4');
    const nFrames = Math.ceil(total * fps);
    const sheetTimes = sampleTimes(data, total);
    // Slot numbers are fixed up front: slices finish out of order, so the file name must come from the time, not from
    // how many frames a worker happened to capture first.
    sheetTimes.forEach((s, i) => { s.i = i; });
    const sheet = [];
    const t0 = Date.now();
    const K = Math.max(1, Math.min(opts.workers || defaultWorkers(), nFrames));
    const chunks = Array.from({ length: K }, (_, k) => [Math.floor((k * nFrames) / K), Math.floor(((k + 1) * nFrames) / K)]);
    const segFiles = [];
    const encArgs = (file) => ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), file];
    const drawChunk = async (k) => {
      const [from, to] = chunks[k];
      const pg = k === 0 ? page : await browser.newPage();
      if (k !== 0) {
        await pg.setViewport(540, 960, 2);
        await pg.goto(pathToFileURL(stagePath).href);
        await pg.settle(30000);
        await pg.evaluate(() => window.__fit && window.__fit());
      }
      const seg = path.join(out, `seg-${String(k).padStart(2, '0')}.mp4`);
      const enc = spawn('ffmpeg', encArgs(seg), { stdio: ['pipe', 'ignore', 'pipe'] });
      let err = '';
      enc.stderr.on('data', (d) => { err += d; });
      for (let f = from; f < to; f++) {
        const t = f / fps;
        await pg.evaluate(`window.__seek(${t})`);
        const buf = await pg.screenshot({ clip: { x: 0, y: 0, width: 540, height: 960 }, format: 'jpeg', quality: 92, beyond: false });
        if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
        // A slot is filled only once this slice's clock has actually reached its time, and only for slots inside this
        // slice — otherwise a slice that starts late grabs a frame meant for an earlier moment.
        const want = sheetTimes.find((s) => !s.done && s.t >= from / fps && t >= s.t);
        if (want) { want.done = true; const p = path.join(out, 'review', `f-${String(want.i).padStart(2, '0')}.jpg`); fs.writeFileSync(p, buf); sheet.push({ ...want, file: p }); }
        if (f === 0) fs.writeFileSync(path.join(out, 'cover.jpg'), buf);
        if (k === 0 && f % (fps * 10) === 0 && f) log(`  帧 ${f}/${nFrames}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
      }
      enc.stdin.end();
      await new Promise((r) => enc.on('close', r));
      if (!fs.existsSync(seg)) throw new Error(`编码失败（第 ${k + 1} 段）：${err.slice(-500)}`);
      if (k !== 0) await pg.close();
      segFiles[k] = seg;
    };
    await Promise.all(chunks.map((_, k) => drawChunk(k)));
    const listPath = path.join(out, 'segments.txt');
    fs.writeFileSync(listPath, segFiles.map((f) => `file '${path.basename(f)}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', silentMp4]);
    fs.rmSync(listPath, { force: true });
    for (const f of segFiles) fs.rmSync(f, { force: true });
    sheet.sort((a, b) => a.i - b.i);
    log(`  ${nFrames} 帧，${K} 路并行，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    capDrops = captionDropouts(silentMp4, data.captions, fps);

    // Cover images: full 9:16 frame 0 and a 3:4 center crop for 小红书-style covers.
    ff(['-i', path.join(out, 'cover.jpg'), path.join(out, 'cover.png')]);
    ff(['-i', path.join(out, 'cover.jpg'), '-vf', 'crop=1080:1440:0:240', '-q:v', '2', path.join(out, 'cover-3x4.jpg')]);
    fs.rmSync(path.join(out, 'cover.jpg'));

    // Contact sheet for review (HTML → screenshot).
    const sheetHtml = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;font:14px -apple-system,sans-serif;color:#eee;width:${6 * 222}px}
      .g{display:grid;grid-template-columns:repeat(6,210px);gap:12px;padding:12px}.g div{text-align:center}img{width:210px;display:block;border-radius:6px}</style>
      <div class="g">${sheet.filter((s) => fs.existsSync(s.file)).map((s) => `<div><img src="${pathToFileURL(s.file).href}"><div>${s.t.toFixed(2)}s · ${esc(s.label)}</div></div>`).join('')}</div>`;
    const sheetPath = path.join(out, 'review', 'sheet.html');
    fs.writeFileSync(sheetPath, sheetHtml);
    const rows = Math.ceil(sheet.filter((s) => fs.existsSync(s.file)).length / 6);
    await page.setViewport(6 * 222, rows * 410 + 24, 1);
    await page.goto(pathToFileURL(sheetPath).href);
    await page.settle(5000);
    fs.writeFileSync(path.join(out, 'contact-sheet.jpg'), await page.screenshot({ format: 'jpeg', quality: 85 }));
    await page.close();
  } finally {
    await browser.close();
  }

  // Mix: narration (delayed to VO) + soft whooshes; master to -14 LUFS / -1 dBTP.
  const narr = path.join(path.dirname(path.join(out, 'x')), '..', 'voice', 'narration.wav');
  const voicePath = opts.narration || narr;
  const mixRaw = path.join(out, 'mix-raw.wav');
  const ms = Math.round(VO * 1000);
  ff(['-i', voicePath, '-i', path.join(out, 'sfx.wav'), '-filter_complex',
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},apad=whole_dur=${total}[v];[1:a]aresample=48000,volume=-6dB[s];[v][s]amix=inputs=2:normalize=0:duration=first[a]`,
    '-map', '[a]', '-t', String(total), mixRaw]);
  const mixPath = path.join(out, 'mix.wav');
  const loud = loudnorm(mixRaw, mixPath);
  fs.rmSync(mixRaw);

  const mp4 = path.join(out, 'video.mp4');
  ff(['-i', path.join(out, 'video-silent.mp4'), '-i', mixPath, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest',
    '-metadata', `title=${plainText(video.cover?.title || '').replace(/\n/g, ' ')}`,
    '-metadata', 'comment=AIGC: 本视频的配音与画面由 AI 辅助生成（article2media）',
    '-metadata', 'description=AI 生成内容', '-movflags', '+faststart', mp4]);
  fs.rmSync(path.join(out, 'video-silent.mp4'));

  // SRT
  const srt = data.captions.map((c, k) => `${k + 1}\n${tc(c.t)} --> ${tc(c.until)}\n${c.html.replace(/<[^>]+>/g, '')}\n`).join('\n');
  fs.writeFileSync(path.join(out, 'captions.srt'), srt);

  return { mp4, total, VO, fps, captions: data.captions, captionStyle: data.captionStyle, events: data.events, karaoke: data.karaoke, issues, loudness: loud, capDrops };
}

const tc = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`;
};

/** Moments worth looking at: cover, its fade, the first 5 s, and each scene shortly after it settles and near its end. */
function sampleTimes(data, total) {
  const t = [{ t: 0.1, label: '封面' }, { t: 0.62, label: '封面渐隐' }, { t: 1.6, label: '1.6s' }, { t: 3.2, label: '3.2s' }, { t: 4.9, label: '5s 前' }];
  const ins = data.events.filter((e) => e.p === 'scene-in');
  ins.forEach((e, i) => {
    const end = ins[i + 1] ? ins[i + 1].t : total;
    if (e.t > 5) t.push({ t: e.t + 1.2, label: `第 ${i + 1} 镜` });
    t.push({ t: end - 0.35, label: `第 ${i + 1} 镜末` });
  });
  return t.filter((x) => x.t < total).sort((a, b) => a.t - b.t);
}
