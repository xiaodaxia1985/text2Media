#!/usr/bin/env node
// article-rewrite · Validate a content.json (改写稿); add --ratio 3:4 etc. to check card limits too.
// Runs the shared engine (../../../engine), shared by every skill in this repo.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const engine = process.env.ARTICLE2MEDIA_ENGINE ? pathToFileURL(process.env.ARTICLE2MEDIA_ENGINE.replace(/\/?$/, '/scripts/')) : new URL('../../../engine/scripts/', import.meta.url);
if (!fs.existsSync(new URL('render.mjs', engine))) {
  console.error('✗ 找不到共享引擎 engine/：article-rewrite 要和仓库根目录的 engine/ 装在一起（插件安装会一起装好）');
  process.exit(2);
}
process.env.A2M_CLI = 'check.mjs';
process.argv.splice(2, 0, '--check');
await import(new URL('render.mjs', engine));
