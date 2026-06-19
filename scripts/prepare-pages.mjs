import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'output', 'pages');
const publicDir = join(root, 'public');
const indexPath = join(root, 'index.html');
const swPath = join(publicDir, 'sw.js');

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

cpSync(publicDir, outDir, { recursive: true });
cpSync(indexPath, join(outDir, 'index.html'));
cpSync(indexPath, join(outDir, '404.html'));

// GitHub Pages + SPA fallback:
// - Keep generated 404.html so deep links load the app shell.
// - Disable Jekyll processing to prevent underscore path issues.
writeFileSync(join(outDir, '.nojekyll'), '');

if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');

  // On GitHub Pages, a stale service worker can outlive deploys.
  // Keep the current file but ensure cache keys are unique per build by stamping.
  const stamp = `\n// pages-build-stamp:${Date.now()}\n`;
  writeFileSync(join(outDir, 'sw.js'), `${sw}${stamp}`);
}

console.log(`Prepared GitHub Pages artifact at ${outDir}`);
