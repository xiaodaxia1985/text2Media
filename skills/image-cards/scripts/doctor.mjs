#!/usr/bin/env node
// image-cards · Environment check (Node, Chrome).
// Runs the shared engine (../../../engine), shared by every skill in this repo.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const engine = process.env.ARTICLE2MEDIA_ENGINE ? pathToFileURL(process.env.ARTICLE2MEDIA_ENGINE.replace(/\/?$/, '/scripts/')) : new URL('../../../engine/scripts/', import.meta.url);
if (!fs.existsSync(new URL('doctor.mjs', engine))) {
  console.error('✗ 找不到共享引擎 engine/：image-cards 要和仓库根目录的 engine/ 装在一起（插件安装会一起装好）');
  process.exit(2);
}
process.env.A2M_CLI = 'doctor.mjs';
await import(new URL('doctor.mjs', engine));
