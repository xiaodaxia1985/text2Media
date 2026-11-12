// 版式量纲：所有数值以「输出像素」口径给出（3:4 = 1080×1440）。
// 引擎画布是 540×720，渲染 scale 2，所以 CSS 值一律 = 输出值 / 2。
// 规则来源：归藏纵向五段预算 / 覆盖率 / 四横带 / 标题五档 / 最小可读字号，已按我们的
// 3:4 口径换算并收紧（详见 docs/架构重构_v1_2026-11-12.md 第 3 节）。

export const PT = 2; // 输出像素 → CSS 像素的除数

/** 3:4 / 1080×1440 的五段纵向预算（输出像素）。 */
export const VERTICAL_BUDGET = {
  header: [56, 90],    // 页眉（系列 / 幕标 / 页码）
  title: [240, 420],   // 标题区
  body: [520, 760],    // 证据主体
  bottom: [90, 180],   // 底部条（结论 / 来源）
  footer: [52, 86],    // 页脚
};

/** 质量闸门：全部按输出像素。 */
export const GATES = {
  coverageWarn: 0.78,       // 内容占比低于 78% 提示
  coverageError: 0.70,      // 低于 70% 报错
  gapWarn: 216 / 1440,      // 内部空档 > 15%（216px）提示
  gapError: 324 / 1440,     // > 22.5%（324px）报错
  openerGapWarn: 432 / 1440, // 章节页允许更大的留白（≤60% 占位），>30% 才提示
  titleMaxLines: 3,
};

/** 最小可读字号（输出像素 / CSS 像素 / 地板）。 */
export const MIN_TYPE = {
  body: { px: 28, css: 14, floor: 12 },
  quote: { px: 30, css: 15, floor: 13 },
  label: { px: 20, css: 10, floor: 9 },
};

/** 中文大标题五档（输出像素）：字数越少字越大。 */
export const TITLE_TIERS = [
  { maxChars: 6, maxLines: 1, px: 132 },
  { maxChars: 10, maxLines: 1, px: 108 },
  { maxChars: 8, maxLines: 2, px: 96 },
  { maxChars: 12, maxLines: 2, px: 84 },
  { maxChars: Infinity, maxLines: 3, px: 72 },
];

const stripPunct = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*?|__?|`/g, '')
    .replace(/[，。、；：！？,;:!?…·—\-]/g, '')
    .replace(/\s/g, '');

/** 标题档位：按「去掉标点后的字数 + 显式行数」选一档，返回 CSS px。 */
export function titleTier(text, { min = 36, max = 66 } = {}) {
  const raw = String(text ?? '').split('\n').map((l) => stripPunct(l)).filter(Boolean);
  const lines = Math.max(1, raw.length);
  const chars = raw.reduce((a, l) => a + [...l].length, 0);
  const longest = raw.length ? Math.max(...raw.map((l) => [...l].length)) : 0;
  let px = TITLE_TIERS[TITLE_TIERS.length - 1].px;
  if (lines === 1 && chars <= 6) px = TITLE_TIERS[0].px;
  else if (lines === 1 && chars <= 10) px = TITLE_TIERS[1].px;
  else if (lines === 2 && longest <= 8) px = TITLE_TIERS[2].px;
  else if (lines <= 2 && chars <= 24) px = TITLE_TIERS[3].px;
  else px = TITLE_TIERS[4].px;
  const css = px / PT;
  return Math.max(min, Math.min(max, Math.round(css)));
}

/** 主张卡的字号：标题五档去掉「最小 36」，允许短句更大（66 CSS = 132 输出）。 */
export const claimTier = (text) => titleTier(text, { min: 36, max: 66 });

/**
 * 每页密度预算：条目数 / 字数上限。超了要回改写端补或拆，不许缩字号硬塞。
 * 参照归藏各类 recipe 的容量上限，换算成我们卡型的字段。
 */
export const DENSITY = {
  claim: { text: 26, note: 40 },
  compare: { items: 4, itemChars: 14, note: 30 },
  timeline: { nodes: 6, titleChars: 14, noteChars: 22 },
  stat: { stats: 3, labelChars: 8, noteChars: 20 },
  list: { rows: 6, rowChars: 26 },
  opener: { headingChars: 12, leadChars: 40 },
};

/** 内部空档（内容之间的空白）判据：只看内容块与内容块之间，不看上下留白。 */
export const isOpener = (kind) => kind === 'opener';

export function formatPct(v) {
  return `${Math.round((Number(v) || 0) * 100)}%`;
}
