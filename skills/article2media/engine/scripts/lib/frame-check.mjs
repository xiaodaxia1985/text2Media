// 画框预演（B 防线）：把出好的卡片放进目标平台的真实画框里，算清楚平台会裁掉哪一块、
// 正文有没有落进曲面屏的遮挡带，并渲一张 frame-check.png 给人眼看。
// 触发今天这个事故的场景：9:16 的图塞进 3:4 画框 → 左右各裁 12.5%，第一行字直接没了。
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 卡片 CSS 尺寸（与 render 时的 spec 一致），用于把 ink 坐标换算成比例。
export function simulateFrame({ cardW, cardH, frame, ink }) {
  const [fw, fh] = frame;
  const s = Math.max(fw / cardW, fh / cardH); // cover：填满画框
  const visW = fw / s, visH = fh / s;
  const offX = (cardW - visW) / 2, offY = (cardH - visH) / 2;
  const cut = { left: offX, right: offX, top: offY, bottom: offY };
  const view = { left: offX, right: cardW - offX, top: offY, bottom: cardH - offY };
  let worst = 0;
  if (ink) {
    worst = Math.max(
      view.left - ink.l, ink.r - view.right, view.top - ink.t, ink.b - view.bottom,
    );
  }
  return { scale: s, visW, visH, cut, view, worst };
}

export function buildFrameCheck({ platform, cards, spec, images }) {
  const [fw, fh] = platform.frame;
  const boxW = 300;
  const boxH = Math.round((boxW * fh) / fw);
  const issues = [];
  const cells = cards.map((c) => {
    const sim = simulateFrame({ cardW: spec.w, cardH: spec.h, frame: platform.frame, ink: c.ink });
    const imgW = (boxW * spec.w) / sim.visW;
    const offLeft = -sim.cut.left * (imgW / spec.w);
    const offTop = -sim.cut.top * (imgW / spec.w);
    const safeL = platform.safe * boxW, safeR = boxW - safeL;
    const safeT = platform.safe * boxH, safeB = boxH - safeT;
    // 裁切：ink 超出可视区
    if (sim.worst > 1) {
      issues.push({
        level: 'error',
        where: `卡 ${String(c.idx).padStart(2, '0')}`,
        msg: `${platform.key} 画框 ${fw}×${fh} 会裁掉这张卡 ${Math.round(sim.worst)}px 的正文：比例不对，按 ${platform.ratio} 重出`,
      });
    }
    // 遮挡带：ink 落进曲面屏遮挡区（换算到画框坐标）
    let band = 0;
    if (c.ink) {
      const toBox = (v) => ((v - sim.cut.left) * imgW) / spec.w;
      const toBoxY = (v) => ((v - sim.cut.top) * imgW) / spec.w;
      band = Math.max(
        safeL - toBox(c.ink.l), toBox(c.ink.r) - safeR,
        safeT - toBoxY(c.ink.t),
      );
    }
    if (band > 1 && sim.worst <= 1) {
      issues.push({
        level: 'warn',
        where: `卡 ${String(c.idx).padStart(2, '0')}`,
        msg: `正文离画框边缘只剩 ${Math.round(band)}px（画框 ${boxW}px 宽），曲面屏可能挡住，边距再放宽一点`,
      });
    }
    return { c, sim, imgW, offLeft, offTop, boxW, boxH };
  });

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #111214; color: #e6e8ee; font: 12px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; padding: 22px; }
h1 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
p.sub { color: #9aa0ae; margin-bottom: 18px; }
.grid { display: grid; grid-template-columns: repeat(3, ${boxW}px); gap: 20px 18px; }
.fr { position: relative; width: ${boxW}px; height: ${boxH}px; overflow: hidden; border-radius: 10px; background: #000; }
.fr img { position: absolute; display: block; }
.mask { position: absolute; top: 0; bottom: 0; background: rgba(0,0,0,.82); }
.mask-t, .mask-b { position: absolute; left: 0; right: 0; background: rgba(0,0,0,.82); }
.safe { position: absolute; border: 1px dashed rgba(255,90,90,.75); border-radius: 6px; }
.cap { color: #9aa0ae; margin-top: 6px; font-variant-numeric: tabular-nums; }
.bad { color: #ff6b6b; }
</style></head><body>
<h1>${platform.key} · 画框预演 ${fw}×${fh}</h1>
<p class="sub">虚线以内是曲面屏不会挡的安全区；黑色蒙版是平台会裁掉的部分。${platform.note}</p>
<div class="grid">
${cells.map(({ c, sim, imgW, offLeft, offTop }) => {
    const mw = Math.max(0, (-offLeft));
    const maskL = mw > 0.5 ? `<div class="mask" style="left:0;width:${mw.toFixed(1)}px"></div><div class="mask" style="right:0;width:${mw.toFixed(1)}px"></div>` : '';
    const mh = Math.max(0, (-offTop));
    const maskV = mh > 0.5 ? `<div class="mask-t" style="top:0;height:${mh.toFixed(1)}px"></div><div class="mask-b" style="bottom:0;height:${mh.toFixed(1)}px"></div>` : '';
    const safe = `<div class="safe" style="left:${(platform.safe * boxW).toFixed(1)}px;top:${(platform.safe * boxH).toFixed(1)}px;right:${(platform.safe * boxW).toFixed(1)}px;bottom:${(platform.safe * boxH).toFixed(1)}px"></div>`;
    const cutNote = sim.worst > 1
      ? `<span class="bad">被裁 ${Math.round(sim.worst * (boxW / spec.w))}px</span>`
      : '完整';
    return `<div><div class="fr"><img src="${images[String(c.idx).padStart(2, '0')] || ''}" style="width:${imgW.toFixed(1)}px;left:${offLeft.toFixed(1)}px;top:${offTop.toFixed(1)}px">${maskL}${maskV}${safe}</div><div class="cap">卡 ${String(c.idx).padStart(2, '0')} · ${cutNote}</div></div>`;
  }).join('\n')}
</div></body></html>`;

  return { html, width: boxW * 3 + 18 * 2 + 44, height: 120 + (boxH + 34) * Math.ceil(cells.length / 3), issues };
}

export function frameCheckPath(outDir) {
  return path.join(outDir, 'frame-check.png');
}

export function imageFileUrl(outDir) {
  return pathToFileURL(outDir).href.replace(/\/?$/, '/').replace(/^file:\/\/\//, 'file:///');
}
