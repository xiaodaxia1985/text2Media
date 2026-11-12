// Layout QA that runs inside the rendered page. Must be self-contained (it is serialized via toString()).
export function qaInPage(opts) {
  const issues = [];
  const where = (el) => {
    const card = el.closest('[data-card]');
    const pre = card ? `卡 ${String(card.dataset.card).padStart(2, '0')} · ` : '';
    const fig = el.closest('[data-fig]');
    if (fig) return `${pre}图 ${fig.dataset.fig}`;
    const sec = el.closest('[data-sec]');
    if (sec) return `${pre}第 ${sec.dataset.sec} 节`;
    if (el.closest('.pg-closing')) return '页尾收束句';
    if (el.closest('.pg-intro')) return '导语';
    if (el.closest('.pg-title')) return '大标题';
    if (card) return pre.replace(/ · $/, '') + (el.classList.contains('c-body') ? '' : ` · ${el.className || el.tagName}`);
    return el.className || el.tagName;
  };
  const snippet = (el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 22);

  // Distinct line tops of an element's text.
  const lineTops = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = [];
    for (const rect of r.getClientRects()) {
      if (rect.width < 1) continue;
      if (!tops.some((t) => Math.abs(t - rect.top) < 4)) tops.push(rect.top);
    }
    return tops.sort((a, b) => a - b);
  };

  // Characters sitting on the last line (non-space, non-punctuation).
  const lastLineChars = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const chars = [];
    let n;
    while ((n = walker.nextNode())) for (let i = 0; i < n.data.length; i++) chars.push([n, i]);
    const range = document.createRange();
    let lastTop = null, count = 0, text = '';
    for (let k = chars.length - 1; k >= 0; k--) {
      const [node, i] = chars[k];
      const ch = node.data[i];
      if (/\s/.test(ch)) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const top = rects[0].top;
      if (lastTop === null) lastTop = top;
      if (Math.abs(top - lastTop) > 4) break;
      text = ch + text;
      if (!/[\p{P}\p{S}]/u.test(ch)) count++;
    }
    return { count, text };
  };

  // 1) Figure canvases
  for (const c of document.querySelectorAll('.fig-canvas')) {
    const r = c.getBoundingClientRect();
    let worst = 0;
    for (const el of c.querySelectorAll('*')) {
      if (el.closest('svg') && !['text', 'tspan', 'rect'].includes(el.tagName)) continue;
      if (el.tagName === 'svg') continue;
      const e = el.getBoundingClientRect();
      if (!e.width && !e.height) continue;
      worst = Math.max(worst, r.left - e.left, e.right - r.right, r.top - e.top, e.bottom - r.bottom);
    }
    if (worst > 2) issues.push({ level: 'error', where: where(c), msg: `图内内容超出画布 ${Math.round(worst)}px：缩短图内文字或减少项目` });

    for (const el of c.querySelectorAll('.box, .hb-label, .ss-val, .qt-text, .pa-label, .cmp-col')) {
      // Clipped boxes: any overflow hides text. Unclipped ones: only horizontal overflow matters
      // (tall glyphs legitimately exceed a tight line-height without being cut off).
      const clipped = getComputedStyle(el).overflow !== 'visible';
      if (el.scrollWidth > el.clientWidth + 1 || (clipped && el.scrollHeight > el.clientHeight + 1)) {
        issues.push({ level: 'error', where: where(el), msg: `文字被截断：「${snippet(el)}」` });
      }
    }
    for (const el of c.querySelectorAll('.box')) {
      const lines = lineTops(el).length;
      if (lines > 2) issues.push({ level: 'warn', where: where(el), msg: `图内方框文字折成 ${lines} 行：「${snippet(el)}」，建议缩短` });
    }
    // Overlapping boxes inside one figure
    const boxes = [...c.querySelectorAll('.box, .pa-label')].map((b) => [b, b.getBoundingClientRect()]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i][1], b = boxes[j][1];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 3 && oy > 3) {
        issues.push({ level: 'error', where: where(boxes[i][0]), msg: `图内元素重叠：「${snippet(boxes[i][0])}」与「${snippet(boxes[j][0])}」` });
      }
    }
  }

  // 2) Orphans: a single character alone on the last line (body text and boxes inside figures)
  // (boxes with a <small> sub-label break lines on purpose, so they are skipped)
  for (const el of document.querySelectorAll('[data-qa-text], .fig-canvas .box:not(:has(small))')) {
    if (lineTops(el).length < 2) continue;
    const { count, text } = lastLineChars(el);
    if (count <= 1) issues.push({ level: 'warn', where: where(el), msg: `末行只剩「${text}」：改写这句，增减两三个字` });
  }

  // 3) Headings that wrap into too many lines
  for (const el of document.querySelectorAll('.sec-h')) {
    const n = lineTops(el).length;
    if (n > 3) issues.push({ level: 'warn', where: where(el), msg: `小标题占了 ${n} 行，建议缩短或调整 \\n 断行` });
  }

  // 4) Broken images, failed fonts
  for (const img of document.images) {
    if (!img.naturalWidth) issues.push({ level: 'error', where: where(img), msg: `图片加载失败：${img.src.slice(0, 80)}` });
  }
  const failed = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').length;
  if (failed.length && !loaded) issues.push({ level: 'warn', where: '字体', msg: `网络字体加载失败（${[...new Set(failed)].join(', ')}），已回退到系统字体` });

  // 5a) Card figures that had to shrink below a readable scale
  if (typeof window.__fit === 'function') window.__fit();
  for (const card of document.querySelectorAll('[data-card][data-dropped]')) {
    if (card.dataset.dropped) {
      issues.push({ level: 'warn', where: where(card.querySelector('.c-body')), msg: `放不下，已自动省略：${card.dataset.dropped}（想保留就缩短 card.text，或用 "mode": "split"）` });
    }
  }
  for (const box of document.querySelectorAll('.c-fig-box[data-scale]')) {
    if (box.closest('[hidden]')) continue;
    const z = Number(box.dataset.scale);
    if (z < 1.05) issues.push({ level: 'warn', where: where(box), msg: `图只放大到 ${z.toFixed(2)} 倍，手机上文字偏小：缩短 card.text、去掉 bullets，或改用 split` });
  }

  // 5) Fixed-size cards: content must fit
  // ink = 卡片里真正有内容的范围（文字 + 图），供画框预演算平台会裁掉哪一块
  const inkRect = (card) => {
    const cr = card.getBoundingClientRect();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const range = document.createRange();
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.data.trim()) continue;
      range.selectNodeContents(n);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        l = Math.min(l, rect.left); t = Math.min(t, rect.top);
        r = Math.max(r, rect.right); b = Math.max(b, rect.bottom);
      }
    }
    for (const el of card.querySelectorAll('img, .fig-canvas')) {
      const e = el.getBoundingClientRect();
      if (!e.width) continue;
      l = Math.min(l, e.left); t = Math.min(t, e.top);
      r = Math.max(r, e.right); b = Math.max(b, e.bottom);
    }
    if (!Number.isFinite(l)) return null;
    return { l: l - cr.left, t: t - cr.top, r: r - cr.left, b: b - cr.top };
  };
  // 版式量纲：内容覆盖率 / 内部空档 / 四横带。
  // 只看 .c-body 里"内容块与内容块之间"的空白：
  //   居中卡（主张 / 章节页 / 时间线 / 数据卡 / 清单 / 收尾）上下留白是设计，
  //   但要量它的内部窟窿；顶对齐卡（封面 / 常规 / 对比）则要量首尾还剩多少。
  const contentMetrics = (body) => {
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
    if (!rects.length) return null;
    rects.sort((a, b) => a[0] - b[0]);
    // 合并成"内容带"（间隙 <3px 视为同一带）
    const bands = [];
    for (const [t, b] of rects) {
      const last = bands[bands.length - 1];
      if (last && t - last[1] <= 3) last[1] = Math.max(last[1], b);
      else bands.push([t, b]);
    }
    const first = bands[0][0];
    const lastB = bands[bands.length - 1][1];
    const coverage = H ? (lastB - first) / H : 0;
    let maxGap = 0, gapAt = 0;
    for (let i = 1; i < bands.length; i++) {
      const g = bands[i][0] - bands[i - 1][1];
      if (g > maxGap) { maxGap = g; gapAt = bands[i - 1][1] / H; }
    }
    const quarters = [0, 1, 2, 3].map((q) => {
      const s = (H * q) / 4, e = (H * (q + 1)) / 4;
      return bands.some(([t, b]) => b > s + 1 && t < e - 1);
    });
    return { coverage, maxGap, gapAt, headGap: first, tailGap: Math.max(0, H - lastB), quarters, H };
  };

  const cards = [...document.querySelectorAll('[data-card]')].map((card) => {
    const body = card.querySelector('.c-body');
    const over = body ? body.scrollHeight - body.clientHeight : 0;
    if (over > 1) {
      issues.push({ level: 'error', where: where(body), msg: `卡片内容超出 ${over}px：缩短 card.text、减少 bullets，或改用 "mode": "split"` });
    }
    // 居中卡（主张 / 章节页 / 时间线 / 数据卡）里的说明段落：一旦排满整卡宽度，居中就失效，
    // 读起来是"几行小字横铺一长排"，缩到手机上看更像拉丝。这里自动量每行宽度。
    const r = card.getBoundingClientRect();
    const centred = ['c-claimcard', 'c-openercard', 'c-timeline', 'c-statcard'].some((k) => card.classList.contains(k));
    if (body && centred) {
      const innerW = body.clientWidth;
      for (const el of body.querySelectorAll('p, .c-open-lead, .c-claim-note, .c-tl-note')) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [...range.getClientRects()].filter((x) => x.width > 4 && x.height > 4);
        if (lines.length < 2) continue;
        const widest = Math.max(...lines.map((x) => x.width));
        if (widest > innerW * 0.86) {
          issues.push({ level: 'warn', where: where(el), msg: `居中的说明段落排成了长排（最宽一行占卡宽 ${Math.round((widest / innerW) * 100)}%）：收窄容器宽度或手动断行` });
        }
      }
    }
    // ---- 内容密度：内部空档 / 首尾空 / 覆盖率 / 四横带（按卡高比例判，3:4 口径输出 720×2）----
    const isOpener = card.classList.contains('c-openercard');
    const isCentred = ['c-claimcard', 'c-openercard', 'c-timeline', 'c-statcard', 'c-list', 'c-end'].some((k) => card.classList.contains(k));
    const tag = `卡 ${String(card.dataset.card).padStart(2, '0')}`;
    const m = body ? contentMetrics(body) : null;
    if (m) {
      const at = m.gapAt < 0.34 ? '上段' : m.gapAt < 0.67 ? '中段' : '下段';
      const gapOut = Math.round(m.maxGap * 2); // 输出像素
      const pct = Math.round((m.maxGap / m.H) * 100);
      // 阈值按卡型分档：章节页 / 封面天生是"少字＋大留白"的结构，给它们更宽的上限；
      // 但超过上限照样报——留白是设计，漏排也是留白，只能靠数字区分。
      const cover = card.classList.contains('c-cover');
      if (isOpener && m.maxGap / m.H > 0.30) {
        issues.push({ level: 'warn', where: tag, msg: `章节页${at}空了 ${gapOut}px（占卡高 ${pct}%）：加一个锚点（幕标＋导语或一句金句），或并进邻页` });
      } else if (cover && m.maxGap / m.H > 0.28) {
        issues.push({ level: 'error', where: tag, msg: `封面${at}空了 ${gapOut}px（占卡高 ${pct}%）：标题、导语、目录三段之间不要凿洞` });
      } else if (cover && m.maxGap / m.H > 0.20) {
        issues.push({ level: 'warn', where: tag, msg: `封面${at}有 ${gapOut}px 连续空白（占卡高 ${pct}%）：超过封面 20% 上限` });
      } else if (!cover && !isOpener && m.maxGap / m.H > 0.225) {
        issues.push({ level: 'error', where: tag, msg: `${at}出现 ${gapOut}px 的整段空白（占卡高 ${pct}%）：把块间距压回去，或让内容自己填住这段` });
      } else if (!cover && m.maxGap / m.H > 0.15) {
        issues.push({ level: 'warn', where: tag, msg: `${at}有 ${gapOut}px 连续空白（占卡高 ${pct}%）：超过 15% 上限` });
      }
      if (!isCentred) {
        // 顶对齐的卡：内容从上面开始，下面的空就是"没排完"
        if (m.tailGap / m.H > 0.15) {
          issues.push({ level: 'warn', where: tag, msg: `底部空 ${Math.round(m.tailGap * 2)}px（占卡高 ${Math.round((m.tailGap / m.H) * 100)}%）：补一条证据或把结论移到底部条` });
        }
        const covPct = Math.round(m.coverage * 100);
        if (m.coverage < 0.70) {
          issues.push({ level: 'error', where: tag, msg: `内容只占卡高 ${covPct}%（低于 70%）：回改写端补证据，不许靠拉行高凑版式` });
        } else if (m.coverage < 0.78) {
          issues.push({ level: 'warn', where: tag, msg: `内容占卡高 ${covPct}%（低于 78%）：这张卡偏空，补一句证据或换更贴内容的卡型` });
        }
        const q = m.quarters;
        if ((!q[0] && !q[1]) || (!q[1] && !q[2]) || (!q[2] && !q[3])) {
          issues.push({ level: 'warn', where: tag, msg: `四横带里有相邻两带全空（${q.map((x) => (x ? '有' : '空')).join('/')}）：内容被挤到一侧了` });
        }
      } else {
        // 居中的卡不比覆盖率，但要"居中"：上下两侧的空白得差不多，否则就是整体偏下/偏上。
        const diff = Math.abs(m.headGap - m.tailGap) / m.H;
        if (diff > 0.10) {
          const low = m.tailGap < m.headGap;
          issues.push({ level: 'warn', where: tag, msg: `内容整体偏${low ? '下' : '上'}：上方空 ${Math.round(m.headGap * 2)}px、下方空 ${Math.round(m.tailGap * 2)}px，居中没成立` });
        }
      }
    }
    // 用了哪一档溢出处理：让人知道这张卡是排出来的，还是削出来的
    const fit = card.dataset.fit;
    if (fit && /drop/.test(fit)) { /* 已由 5a 单独报，这里不重复 */ }
    else if (fit && /shrink/.test(fit)) {
      issues.push({ level: 'warn', where: tag, msg: `靠收字号才装下（${fit}）：这页内容偏多，建议拆卡或删一句` });
    } else if (fit && /(tight|nudge)/.test(fit)) {
      issues.push({ level: 'warn', where: tag, msg: `靠压间距才装下（${fit}）：内容贴着上限了，留意真机上的拥挤感` });
    }

    return { idx: Number(card.dataset.card), kind: card.dataset.kind, over: Math.max(0, over), x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, ink: inkRect(card), cov: m ? Number(m.coverage.toFixed(3)) : null, gap: m ? Math.round(m.maxGap) : null, fit: fit || '' };
  });

  // 6) Page height (long layout)
  const page = document.querySelector('.page') || document.querySelector('.sheet') || document.querySelector('.wx') || document.body;
  const height = Math.ceil(page.getBoundingClientRect().height);
  const width = Math.ceil(page.getBoundingClientRect().width);
  if (!cards.length && height > opts.maxHeight) issues.push({ level: 'warn', where: '整页', msg: `页面高 ${height}px，超过建议上限 ${opts.maxHeight}px：删减内容或拆成两页` });

  return { height, width, issues, cards };
}
