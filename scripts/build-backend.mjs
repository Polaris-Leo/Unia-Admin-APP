import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(root, 'backend/src/server.js')],
  bundle:   true,
  platform: 'node',
  format:   'cjs',
  // node: 内建模块（fs, path, http, node:sqlite 等）保持外部引用
  // Electron 34 内置 Node 22，拥有 node:sqlite 实验性模块
  external: ['node:*', 'electron'],
  outfile:  resolve(root, 'resources/server.cjs'),
});

console.log('✅ Backend bundled → resources/server.cjs');
