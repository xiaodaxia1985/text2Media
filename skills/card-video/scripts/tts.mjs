// tts.mjs — 口播稿 → narration.wav + alignment.json（给 card-video 用）
//
// 用法：node tts.mjs --script <script.json> --work <workDir> [--voice sweet-woman] [--backend voxcpm] [--dry]
// 产物：<workDir>/voice/narration.wav、<workDir>/voice/alignment.json、<workDir>/voice/chunks/*.wav
//
// script.json 里可选 "say": {"写法":"读法"}、"styles": {"句子":"情绪"} —— 与 video.mjs 同格式；
// 音色清单跑 `node ../article2media/engine/scripts/video.mjs voices`。
//
// 为什么这里要多一步预热：engine 的 detectVoice 给 `import voxcpm` 只有 60 秒窗口，而本机首次冷启动
// 实测 233 秒（torch CUDA 初始化），会被误判成「本机没有 VoxCPM」并静默退到 edge-tts。
// 本 skill 的默认音色必须是本地 VoxCPM，所以探测失败时先预热再重探；仍失败就报错，不静默降级。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '../../article2media/engine/scripts/lib');

const ARGV = process.argv.slice(2);
const arg = (name, dflt) => {
  for (let i = 0; i < ARGV.length; i++) {
    const a = ARGV[i];
    if (a === '--' + name) { const v = ARGV[i + 1]; return v && !v.startsWith('--') ? v : true; }
    if (a.startsWith('--' + name + '=')) return a.slice(name.length + 3);
  }
  return dflt;
};

const SCRIPT = arg('script');
if (SCRIPT === undefined) { console.error('缺 --script <script.json>'); process.exit(1); }
const WORK = arg('work', path.dirname(SCRIPT));
const VOICE_ID = arg('voice', 'sweet-woman');
const BACKEND = arg('backend', 'voxcpm');

const script = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
if (!Array.isArray(script.cards) || !script.cards.length) { console.error('script.json 需要 { "cards": [ { "card": 1, "lines": [...] } ] }'); process.exit(1); }

const voiceDir = path.join(WORK, 'voice');
fs.mkdirSync(voiceDir, { recursive: true });

const scenes = script.cards.map((c, i) => {
  const lines = c.lines || [];
  const styles = lines.map((l) => (script.styles || {})[l] || '');
  return styles.some(Boolean) ? { id: 'c' + String(i + 1).padStart(2, '0'), lines, styles } : { id: 'c' + String(i + 1).padStart(2, '0'), lines };
});

const v = await import(pathToFileURL(path.join(ENGINE, 'video/voice.mjs')).href);

/** 项目里的 voxcpm-venv：环境变量优先，否则从 skills 往上找 .runtime/ */
function findVenvPy() {
  const cands = [process.env.ARTICLE2MEDIA_VOXCPM_PYTHON, process.env.ARTICLE2MEDIA_ASR_PYTHON];
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    dir = path.dirname(dir);
    cands.push(path.join(dir, '.runtime', 'voxcpm-venv', 'Scripts', 'python.exe'));
    cands.push(path.join(dir, '.runtime', 'voxcpm-venv', 'bin', 'python'));
  }
  return cands.filter(Boolean).find((p) => fs.existsSync(p)) || null;
}

let det = v.detectVoice({ fresh: true });
if (BACKEND === 'voxcpm' && !det.voxcpm) {
  const py = findVenvPy();
  if (py) {
    console.log('本机 VoxCPM 探测超时（首次冷启动 torch 约 3 分钟），预热后重探…');
    spawnSync(py, ['-c', 'import voxcpm'], { stdio: 'ignore', timeout: 300000 });
    det = v.detectVoice({ fresh: true });
  }
}
if (BACKEND === 'voxcpm' && !det.voxcpm) {
  console.error([
    '本机没有可用的 VoxCPM，但默认音色要求它（不静默退到 edge-tts）：',
    '  · 确认 .runtime/voxcpm-venv/Scripts/python.exe 能 `import voxcpm`',
    '  · 或显式设 ARTICLE2MEDIA_VOXCPM_PYTHON / ARTICLE2MEDIA_VOXCPM_MODEL',
    '  · 确实只想用在线音色时加 --backend edge（听感和本地音色差很多）',
  ].join('\n'));
  process.exit(1);
}

// --dry：只报「会配几段、每段多长、本机能不能配音」，不真的合成
if (arg('dry', false)) {
  const cat = v.voiceCatalog();
  console.log(JSON.stringify({
    voice: VOICE_ID, default: cat.default, backend: BACKEND, detected: det,
    scenes: scenes.length, lines: scenes.reduce((a, s) => a + s.lines.length, 0),
    chars: scenes.map((s) => ({ id: s.id, chars: s.lines.join('').length })),
  }, null, 2));
  process.exit(0);
}

const al = await v.synthesize(scenes, voiceDir, { voiceId: VOICE_ID, backend: BACKEND, say: script.say || {} });

fs.writeFileSync(path.join(WORK, 'alignment.json'), JSON.stringify(al, null, 2));
console.log('✓ ' + scenes.length + ' 段 / ' + (al.scenes.at(-1)?.end || 0).toFixed(2) + 's -> ' + path.join(voiceDir, 'narration.wav'));
