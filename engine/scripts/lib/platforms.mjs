// 平台表：卡片出图的比例、张数上限、展示画框都由这里决定，不再靠人记。
// 画框（frame）是该平台真正显示图片的那个框，宽高按 1080 基准给：
//   小红书图文 / 抖音图文 = 3:4（1080×1440）—— 交 9:16 进去会被裁掉左右各约 1/8
//   微信 = 1:1（朋友圈九宫格、分享卡）
//   X    = 4:5（信息流竖图，4 张起算）
// safe 是画框内留给曲面屏边缘遮挡的比例（左右上下），正文落进这条带里就会被挡。
export const PLATFORMS = {
  小红书: {
    ratio: '3:4', frame: [1080, 1440], max: 18, safe: 0.04,
    alias: ['小红书', 'xhs', 'redbook', '小红书图文'],
    note: '图文笔记，平台按 3:4 展示；单篇最多 18 张',
  },
  抖音: {
    ratio: '3:4', frame: [1080, 1440], max: 30, safe: 0.04,
    alias: ['抖音', '抖音图文', 'douyin', 'dy'],
    note: '图文按 3:4 展示，单篇最多 30 张（开放平台口径；App 端可到 35，按 30 保守取）；不要交 9:16（9:16 是视频/Stories，套进 3:4 框会左右裁边）',
  },
  微信: {
    ratio: '3:4', frame: [1080, 1440], max: 9, safe: 0.04,
    alias: ['微信', '朋友圈', 'wechat', 'wx', '公众号配图'],
    note: '公众号正文配图 / 朋友圈，按 3:4 展示；公众号长文排版请用 wechat-layout',
  },
  X: {
    ratio: '4:5', frame: [1200, 1500], max: 4, safe: 0.04,
    alias: ['x', 'X', 'twitter', '推特', 'X/Twitter'],
    note: '信息流竖图，单条最多 4 张',
  },
};

export function resolvePlatform(name) {
  if (!name) return null;
  const key = String(name).trim();
  for (const [cn, p] of Object.entries(PLATFORMS)) {
    if (cn === key || p.alias.some((a) => a.toLowerCase() === key.toLowerCase())) return { key: cn, ...p };
  }
  throw new Error(`不认识的平台 "${name}"，可用：${Object.keys(PLATFORMS).join('、')}`);
}

export function platformList() {
  return Object.entries(PLATFORMS).map(([cn, p]) => ({
    key: cn, ratio: p.ratio, size: `${p.frame[0]}×${p.frame[1]}`, max: p.max, note: p.note,
  }));
}
