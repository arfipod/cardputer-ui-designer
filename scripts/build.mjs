import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const entry of ['index.html', 'src', 'public', 'README.md', 'LICENSE']) {
  cpSync(join(root, entry), join(dist, entry), { recursive: true });
}

console.log('Built dist/ static app.');
