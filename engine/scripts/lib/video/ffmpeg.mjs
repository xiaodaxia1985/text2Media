// Where ffmpeg/ffprobe actually live on this machine.
// PATH first, then the usual Windows hiding places: a python.org install drops ffmpeg.exe and
// ffprobe.exe into `<Python>\Scripts`, which is often missing from PATH — and then every
// spawnSync('ffmpeg') fails as "command not found" with an empty stderr, crashing stages
// that look unrelated (atempo, loudnorm, muxing). One resolver, used by every caller.
import fs from 'node:fs';
import path from 'node:path';

export function which(name) {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  const cands = [];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const e of exts) cands.push(path.join(dir, name + e));
  }
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA;
    if (la) for (const v of ['Python313', 'Python312', 'Python311']) cands.push(path.join(la, 'Programs', 'Python', v, 'Scripts', name + '.exe'));
    cands.push(`C:\\ffmpeg\\bin\\${name}.exe`);
  }
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || name;
}

export const FFMPEG = process.env.ARTICLE2MEDIA_FFMPEG || which('ffmpeg');
export const FFPROBE = process.env.ARTICLE2MEDIA_FFPROBE || which('ffprobe');
