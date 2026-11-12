// Validate content.json. Errors block rendering; warnings are advisory (mostly length limits).
import { vlen } from './markup.mjs';
import { FIGURE_TYPES } from './figures.mjs';
import { planCards, ratioSpec, xhsLen } from './layout-card.mjs';

const LIMITS = {
  titleLine: 14,  heading: 18,
  paragraph: 100,
  bullet: 34,
  takeaway: 30,
  caption: 28,
  note: 24,
  intro: 130,
  closing: 66,
  box: 11,
  tableKey: 11,
  tableVal: 56,
  cardTitle: 14,
  cardText: 44,
  quote: 180,
  stageItem: 34,
};

// Argumentative roles a section can declare. claim/compare/timeline/stat/opener change the
// card shape; the rest only guide the planner (they still render as section / checklist cards).
// `grid` was withdrawn on 2026-11-11: one character per column reads as an empty table on a card.
const ROLES = ['claim', 'compare', 'timeline', 'stat', 'opener', 'fig', 'process', 'evidence', 'quote', 'checklist', 'structure', 'sec', 'divider', 'keyword', 'list'];
const ROLE_ALIAS = { divider: 'opener' };

export function validate(c, { layout = 'long', ratio = '3:4', md = '' } = {}) {
  const errors = [];
  const warnings = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  const warn = (p, m) => warnings.push(`${p}: ${m}`);
  const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
  const len = (p, v, max, what) => {
    if (typeof v === 'string' && vlen(v) > max) warn(p, `${what}偏长（约 ${vlen(v)} 字，建议 ≤ ${max}）：「${v.slice(0, 24)}…」`);
  };
  const arr = (p, v, min, what) => {
    if (!Array.isArray(v) || v.length < min) { err(p, `${what}至少需要 ${min} 项`); return false; }
    return true;
  };
  const boxes = (p, list) => (list || []).forEach((t, i) => len(`${p}[${i}]`, typeof t === 'string' ? t : t?.title, LIMITS.box, '图内文字'));

  // A section may declare its argumentative role; the card shape follows from it. Missing payload
  // is only a warning: the engine falls back to a plain section card rather than failing the render.
  const sameText = (v) => typeof v === 'string' && v.trim().length > 0;
  function checkRole(s, S) {
    const role = ROLE_ALIAS[s.role] || s.role;
    if (role === 'claim') {
      const t = s.claim?.text ?? s.card?.text ?? s.paragraphs?.[0];
      if (!sameText(t)) warn(S, 'role 是 claim，但没有 claim.text / card.text / 第一段，会退化为常规卡');
      else { len(`${S}.claim.text`, t, 30, '主张'); if ([...String(t)].length > 30) warn(`${S}.claim.text`, '主卡超过 30 字，主张卡会被挤成正文'); }
      len(`${S}.claim.note`, s.claim?.note, 40, '主张补充');
    }
    if (role === 'compare') {
      const cp = s.compare || {};
      const okSide = (c) => c && Array.isArray(c.items) && c.items.length;
      if (!okSide(cp.left) || !okSide(cp.right)) warn(`${S}.compare`, '缺少 compare.left.items 或 compare.right.items，会退化为常规卡');
      else {
        if (cp.left.items.length > 5 || cp.right.items.length > 5) warn(`${S}.compare`, '对比超过 5 条，卡片会挤；超过 5 条建议拆卡');
        [cp.left, cp.right].forEach((c, i) => (c.items || []).forEach((t, j) => len(`${S}.compare.${i ? 'right' : 'left'}.items[${j}]`, t, 14, '对比条目')));
      }
      len(`${S}.compare.note`, cp.note, 40, '对比说明');
    }
    if (role === 'timeline') {
      const tl = s.timeline || [];
      if (tl.length < 2) warn(`${S}.timeline`, '时间线少于 2 个节点，会退化为常规卡');
      if (tl.length > 6) warn(`${S}.timeline`, '节点超过 6 个，卡片会挤；超过 6 个建议拆卡');
      tl.forEach((t, i) => { len(`${S}.timeline[${i}].title`, t?.title, 14, '节点标题'); len(`${S}.timeline[${i}].note`, t?.note, 22, '节点说明'); });
    }
    if (role === 'stat') {
      const st = s.stats || [];
      if (!st.length || !st.some((x) => sameText(x?.value))) warn(`${S}.stats`, '缺少 stats.value，会退化为常规卡');
      if (st.length > 3) warn(`${S}.stats`, '数字超过 3 个，一卡讲不完；建议拆卡');
      st.forEach((x, i) => { len(`${S}.stats[${i}].label`, x?.label, 8, '数字标签'); len(`${S}.stats[${i}].note`, x?.note, 22, '数字说明'); });
    }
    if (role === 'opener') len(`${S}.heading`, s.heading, 10, '章节页标题');
    if (role === 'fig') {
      if (!(s.figures || []).length) warn(S, 'role 是 fig，但没有 figures，会退化为常规卡');
      else {
        const cap = s.card?.text ?? (s.figures || [])[0]?.caption ?? s.paragraphs?.[0];
        if ([...String(cap || '')].length > 40) warn(`${S}.card.text`, '图说明超过 40 字：图是主角，文字只能压一句');
      }
      if ((s.stats || []).length > 3) warn(`${S}.stats`, '图卡下只留 3 个数字以内');
    }
  }

  // Density floor: a card that carries almost nothing reads as top-heavy no matter how it is centred.
  // The fix belongs in the content — merge two thin sections into one card, or add the second line.
  const FLOOR = 34;
  function checkDensity(s, S) {
    if (['opener', 'sec', 'divider'].includes(ROLE_ALIAS[s.role] || s.role)) return;
    if (s.kind === 'checklist' || s.stages?.length) return;
    const parts = [
      s.heading, s.claim?.text, s.claim?.note, s.compare?.note,
      ...(s.paragraphs || []), ...(s.bullets || []), s.takeaway,
      ...(s.compare ? [...(s.compare.left?.items || []), ...(s.compare.right?.items || [])] : []),
      ...(s.timeline || []).flatMap((t) => [t?.title, t?.note]),
      ...(s.stats || []).flatMap((x) => [x?.value, x?.label, x?.note]),
    ].filter((v) => typeof v === 'string');
    const n = vlen(parts.join(''));
    if (n < FLOOR) warn(S, `内容只有约 ${n} 字，这一张卡会显得空：把相邻的薄节并进来，或补一条说明，不要靠留白凑版式`);
  }


  const info = {};
  if (!c || typeof c !== 'object') return { errors: ['根节点必须是对象'], warnings, info };
  if (!isStr(c.title)) err('title', '缺少大标题');
  else String(c.title).split('\n').forEach((l, i) => len(`title 第 ${i + 1} 行`, l, LIMITS.titleLine, '标题'));
  if (c.lang && !['zh', 'en'].includes(c.lang)) err('lang', '只能是 zh 或 en');
  const okTheme = (t) => typeof t === 'string' && /^[\w-]+$/.test(t);
  if (c.theme !== undefined && !(okTheme(c.theme) || (c.theme && typeof c.theme === 'object' && Object.entries(c.theme).every(([k, v]) => ['long', 'cards'].includes(k) && okTheme(v))))) {
    err('theme', 'theme 必须是主题名（如 "apple-hark"），或 {"long": "…", "cards": "…"}');
  }
  if (!c.source) warn('source', '缺少原文信息，页脚将没有来源行');
  if (!arr('pages', c.pages, 1, 'pages ')) return { errors, warnings, info };
  if (c.pages.length > 4) warn('pages', `共 ${c.pages.length} 页，建议不超过 4 页`);

  c.pages.forEach((pg, pi) => {
    const P = `pages[${pi}]`;
    len(`${P}.intro`, pg.intro, LIMITS.intro, '导语');
    len(`${P}.closing`, pg.closing, LIMITS.closing, '收束句');
    if (!arr(`${P}.sections`, pg.sections, 1, 'sections ')) return;
    const weight = pg.sections.reduce((a, s) => a + (s.kind === 'checklist' ? 2 : 1), 0);
    if (weight > 5) warn(`${P}.sections`, `本页内容较多（${weight} 个单位），渲染后可能过高`);

    pg.sections.forEach((s, si) => {
      const S = `${P}.sections[${si}]`;
      if (!isStr(s.heading)) err(S, '缺少 heading');
      len(`${S}.heading`, s.heading, LIMITS.heading, '小标题');
      (s.paragraphs || []).forEach((t, i) => len(`${S}.paragraphs[${i}]`, t, LIMITS.paragraph, '段落'));

      if (s.kind === 'checklist') {
        if (!arr(`${S}.stages`, s.stages, 1, 'stages ')) return;
        s.stages.forEach((st, j) => {
          if (!isStr(st.title)) err(`${S}.stages[${j}]`, '缺少 title');
          arr(`${S}.stages[${j}].items`, st.items, 1, 'items ');
          (st.items || []).forEach((t, i) => len(`${S}.stages[${j}].items[${i}]`, t, LIMITS.stageItem, '清单项'));
        });
        if (s.guard && !Array.isArray(s.guard.items)) err(`${S}.guard`, 'guard.items 必须是数组');
        return;
      }
      if (s.kind && s.kind !== 'standard') err(`${S}.kind`, `未知类型 ${s.kind}（只能是 standard / checklist）`);
      if (s.role !== undefined) {
        if (s.role === 'grid') err(`${S}.role`, '界格卡已下线（2026-11-11）：一列一个字在小红书卡上读起来像空表格，请改用 claim / compare / timeline / stat，或把这一节并入相邻卡');
        else if (!ROLES.includes(s.role)) err(`${S}.role`, `未知 role ${s.role}（可用：${ROLES.join(' / ')}）`);
        else { checkRole(s, S); checkDensity(s, S); }
      }
      // 证据形态与出处：写了就必须成立，写不成立就是抄错，不放过。
      const FORMS = ['none', 'compare', 'step', 'list', 'number', 'quote', 'image'];
      if (s.evidence !== undefined && !FORMS.includes(s.evidence)) err(`${S}.evidence`, `未知证据形态 ${s.evidence}（可用：${FORMS.join(' / ')}）`);
      if (s.span !== undefined) {
        const sp = s.span;
        if (!sp || typeof sp.start !== 'number' || typeof sp.end !== 'number' || sp.end <= sp.start) err(`${S}.span`, 'span 必须是 {start,end}，且 end > start');
        else if (!md) warn(`${S}.span`, '这一节带 span，但同目录没有 article.md，出处没法核对');
        else if (!isStr(s.source)) warn(`${S}.span`, 'span 没配 source（原文原句），只能人工核对：span 是出处，source 是被引的原句，两个一起写才算闭合');
        else {
          const norm = (v) => String(v || '').replace(/\s+/g, '').replace(/[，。、；：！？,.;:!?"'“”‘’（）()《》…—·]/g, '');
          const slice = norm(md.slice(sp.start, sp.end));
          if (!slice.includes(norm(s.source))) {
            err(`${S}.span`, `span 指向的原文里没有 source「${String(s.source).slice(0, 24)}」：出处抄错了，回 outline 重抽`);
          }
        }
      }
      (s.bullets || []).forEach((t, i) => len(`${S}.bullets[${i}]`, t, LIMITS.bullet, '要点'));
      len(`${S}.takeaway`, s.takeaway, LIMITS.takeaway, '金句');
      if ((s.figures || []).length > 2) warn(`${S}.figures`, '最多显示 2 张图，多余的会被忽略');
      const roleShapesCard = ['claim', 'compare', 'timeline', 'stat', 'opener', 'divider', 'keyword'].includes(s.role);
      if (!s.figures?.length && !s.panel && !roleShapesCard) warn(S, '没有图也没有面板，这一节会只有文字');

      (s.figures || []).forEach((f, fi) => checkFigure(f, `${S}.figures[${fi}]`));

      const p = s.panel;
      if (p) {
        const PP = `${S}.panel`;
        if (!['table', 'cards', 'quote'].includes(p.type)) err(PP, `未知面板类型 ${p.type}（table / cards / quote）`);
        if (p.type === 'table' && arr(`${PP}.rows`, p.rows, 1, 'rows ')) {
          p.rows.forEach((r, i) => {
            if (!Array.isArray(r) || r.length < 2) err(`${PP}.rows[${i}]`, '每行必须是 [标签, 内容]');
            else { len(`${PP}.rows[${i}][0]`, r[0], LIMITS.tableKey, '表格标签'); len(`${PP}.rows[${i}][1]`, r[1], LIMITS.tableVal, '表格内容'); }
          });
        }
        if (p.type === 'cards' && arr(`${PP}.items`, p.items, 1, 'items ')) {
          p.items.forEach((it, i) => { len(`${PP}.items[${i}].title`, it.title, LIMITS.cardTitle, '卡片标题'); len(`${PP}.items[${i}].text`, it.text, LIMITS.cardText, '卡片正文'); });
        }
        if (p.type === 'quote') { if (!isStr(p.text)) err(PP, 'quote 面板缺少 text'); len(`${PP}.text`, p.text, LIMITS.quote, '引文'); }
      }
    });
  });

  const ASPECTS = ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'];
  const cvIll = c.cover?.illustration;
  if (cvIll !== undefined) {
    const pr = typeof cvIll === 'string' ? cvIll : cvIll?.prompt;
    if (!isStr(pr)) err('cover.illustration', '封面插画需要 prompt：写成 {"prompt": "画面描述"} 或直接写字符串');
    if (cvIll?.aspect && !ASPECTS.includes(cvIll.aspect)) err('cover.illustration.aspect', `aspect 只能是 ${ASPECTS.join(' / ')}`);
  }

  function checkFigure(f, F) {
    if (!f || !FIGURE_TYPES.includes(f.type)) { err(F, `未知图表类型 ${f?.type}（可用：${FIGURE_TYPES.join(', ')}）`); return; }
    len(`${F}.caption`, f.caption, LIMITS.caption, '图注');
    len(`${F}.note`, f.note, LIMITS.note, '图内注释');
    switch (f.type) {
      case 'bar':
        if (arr(`${F}.data`, f.data, 2, 'data ')) f.data.forEach((d, i) => {
          const v = Array.isArray(d) ? d[1] : d?.value;
          if (!Number.isFinite(Number(v))) err(`${F}.data[${i}]`, '数值必须是数字');
        });
        break;
      case 'hbar':
        if (arr(`${F}.data`, f.data, 1, 'data ')) f.data.forEach((d, i) => {
          const ok = Array.isArray(d) ? Number.isFinite(Number(d[1])) : Number.isFinite(Number(d?.value)) || (Array.isArray(d?.range) && d.range.length === 2);
          if (!ok) err(`${F}.data[${i}]`, '需要 value（数字）或 range [低, 高]');
          len(`${F}.data[${i}].label`, Array.isArray(d) ? d[0] : d?.label, 6, '条形标签');
        });
        break;
      case 'stack': if (arr(`${F}.items`, f.items, 2, 'items ')) boxes(`${F}.items`, f.items); break;
      case 'flow': if (arr(`${F}.steps`, f.steps, 2, 'steps ')) { boxes(`${F}.steps`, f.steps); if (f.steps.length > 5) warn(`${F}.steps`, '超过 5 步，画布会很挤'); } break;
      case 'grid': if (arr(`${F}.items`, f.items, 2, 'items ')) { boxes(`${F}.items`, f.items); if (f.items.length > 9) warn(`${F}.items`, '超过 9 项，画布会很挤'); } break;
      case 'converge':
        if (arr(`${F}.sources`, f.sources, 2, 'sources ')) { boxes(`${F}.sources`, f.sources); if (f.sources.length > 6) warn(`${F}.sources`, '超过 6 项，画布会很挤'); }
        if (!isStr(f.target)) err(F, 'converge 缺少 target');
        break;
      case 'tree': if (!isStr(f.root)) err(F, 'tree 缺少 root'); if (arr(`${F}.children`, f.children, 1, 'children ')) boxes(`${F}.children`, f.children); break;
      case 'stats': if (arr(`${F}.items`, f.items, 1, 'items ')) f.items.forEach((it, i) => { if (!it?.value) err(`${F}.items[${i}]`, '缺少 value'); }); break;
      case 'equation': if (arr(`${F}.terms`, f.terms, 2, 'terms ')) f.terms.forEach((t, i) => { if (!t?.value) err(`${F}.terms[${i}]`, '缺少 value'); }); break;
      case 'path': arr(`${F}.points`, f.points, 2, 'points '); break;
      case 'compare': if (!f.left?.items || !f.right?.items) err(F, 'compare 需要 left.items 和 right.items'); break;
      case 'cycle': if (arr(`${F}.items`, f.items, 2, 'items ')) boxes(`${F}.items`, f.items); break;
      case 'quote': if (!isStr(f.text)) err(F, 'quote 缺少 text'); len(`${F}.text`, f.text, 40, '引语'); break;
      case 'image': if (!isStr(f.src)) err(F, 'image 缺少 src'); break;
      case 'illustration':
        if (!isStr(f.prompt)) err(F, 'illustration 缺少 prompt（画面描述）');
        if (f.aspect && !ASPECTS.includes(f.aspect)) err(`${F}.aspect`, `aspect 只能是 ${ASPECTS.join(' / ')}`);
        break;
      case 'svg':
        if (!isStr(f.svg) || !/<svg[^>]*viewBox/i.test(f.svg)) err(F, 'svg 必须是带 viewBox 的 <svg> 字符串');
        if (/<script|\son\w+=/i.test(f.svg || '')) warn(F, 'svg 中的脚本和事件属性会被移除');
        if (/#[0-9a-f]{3,8}\b|rgb\(/i.test(f.svg || '')) warn(F, 'svg 里写死了颜色，换主题时不会跟着变；请改用 f-acc / s-acc 等 class');
        break;
    }
  }

  // ---- 3:4 card layout (小红书) ----
  if (layout === 'card') {
    const spec = ratioSpec(ratio);
    const plan = planCards(c, ratio);
    info.cards = plan.length;
    if (plan.length > spec.limit) {
      err('cards', `将生成 ${plan.length} 张卡片，超过 ${spec.name} 单篇上限 ${spec.limit} 张：给次要的节加 "card": {"mode": "skip"}，或少用 split`);
    }
    const cover = c.cover || {};
    String(cover.title || c.title || '').split('\n').forEach((l, i) => len(`cover.title 第 ${i + 1} 行`, l, 10, '封面标题'));
    len('cover.subtitle', cover.subtitle, 60, '封面副标题');
    (cover.points || []).forEach((t, i) => len(`cover.points[${i}]`, t, 16, '封面要点'));
    if (!c.xhs) warn('xhs', '没有小红书文案（xhs.title / caption / tags），caption.md 会用自动摘要');
    else {
      if (xhsLen(c.xhs.title) > 20) err('xhs.title', `小红书标题最多 20 个字符（字母、空格也算），当前 ${xhsLen(c.xhs.title)} 个`);
      if ((c.xhs.caption || '').length > 1000) err('xhs.caption', `正文最多 1000 字，当前 ${c.xhs.caption.length} 字`);
      if ((c.xhs.tags || []).length > 10) warn('xhs.tags', '话题标签建议不超过 10 个');
    }
    c.pages.forEach((pg, pi) => (pg.sections || []).forEach((s, si) => {
      const S = `pages[${pi}].sections[${si}].card`;
      const cd = s.card;
      if (!cd) {
        len(`pages[${pi}].sections[${si}].paragraphs[0]（卡片默认正文）`, s.paragraphs?.[0], 90, '卡片正文');
        return;
      }
      if (cd.mode && !['single', 'split', 'skip'].includes(cd.mode)) err(`${S}.mode`, 'mode 只能是 single / split / skip');
      if (cd.figure !== undefined && cd.figure !== 'none' && !(Number.isInteger(cd.figure) && (s.figures || [])[cd.figure])) err(`${S}.figure`, 'figure 必须是已有图的下标（0 或 1）或 "none"');
      len(`${S}.text`, cd.text ?? s.paragraphs?.[0], 90, '卡片正文');
      (cd.bullets || []).forEach((t, i) => len(`${S}.bullets[${i}]`, t, 26, '卡片要点'));
    }));
  }

  // ---- 公众号 ----
  if (layout === 'wechat') {
    const w = c.wechat || {};
    if (w.title && String(w.title).length > 64) err('wechat.title', `公众号标题最多 64 字，当前 ${String(w.title).length} 字`);
    if (w.digest && String(w.digest).length > 120) err('wechat.digest', `公众号摘要最多 120 字，当前 ${String(w.digest).length} 字`);
    if (!w.title || !w.digest) warn('wechat', '没有写 wechat.title / wechat.digest，会用大标题和第一页导语自动生成');
  }

  return { errors, warnings, info };
}
