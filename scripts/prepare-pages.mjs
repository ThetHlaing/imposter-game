import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'output', 'pages');
const publicDir = join(root, 'public');
const indexPath = join(root, 'index.html');
const swPath = join(publicDir, 'sw.js');
const packageJsonPath = join(root, 'package.json');
const customDomain = process.env.GH_PAGES_CNAME?.trim() || '';

function normalizeBasePath(input) {
  if (!input || input === '/') {
    return '/';
  }

  const trimmed = input.trim();
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const noTrailing = withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;

  return noTrailing || '/';
}

function getBasePath() {
  if (customDomain) {
    return '/';
  }

  if (process.env.GH_PAGES_BASE_PATH) {
    return normalizeBasePath(process.env.GH_PAGES_BASE_PATH);
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const fallback = pkg?.name ? `/${pkg.name}` : '/';

  return normalizeBasePath(fallback);
}

function walkFiles(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

function rewriteQuotedRootPaths(content, basePath) {
  if (basePath === '/') {
    return content;
  }

  // Rewrites string literals that start from root, e.g. "/assets/..." -> "/imposter-game/assets/...".
  return content.replace(/(["'])\/(?!\/)/g, `$1${basePath}/`);
}

function rewriteManifest(filePath, basePath) {
  const raw = readFileSync(filePath, 'utf8');
  const manifest = JSON.parse(raw);

  const prefix = (value) => {
    if (typeof value !== 'string' || !value.startsWith('/')) {
      return value;
    }

    if (basePath === '/') {
      return value;
    }

    return `${basePath}${value}`;
  };

  manifest.start_url = prefix(manifest.start_url);
  manifest.scope = prefix(manifest.scope);
  manifest.id = prefix(manifest.id);

  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => ({
      ...icon,
      src: prefix(icon?.src)
    }));
  }

  if (Array.isArray(manifest.screenshots)) {
    manifest.screenshots = manifest.screenshots.map((shot) => ({
      ...shot,
      src: prefix(shot?.src)
    }));
  }

  writeFileSync(filePath, JSON.stringify(manifest));
}

function rewriteDeployFiles(basePath) {
  const files = walkFiles(outDir);
  let rewrites = 0;

  for (const filePath of files) {
    const ext = filePath.split('.').pop();

    if (filePath.endsWith('manifest.webmanifest')) {
      rewriteManifest(filePath, basePath);
      continue;
    }

    if (!['html', 'js', 'css', 'json', 'webmanifest'].includes(ext)) {
      continue;
    }

    const current = readFileSync(filePath, 'utf8');
    const rewritten = rewriteQuotedRootPaths(current, basePath);

    if (rewritten !== current) {
      writeFileSync(filePath, rewritten);
      rewrites += 1;
    }
  }

  return rewrites;
}

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

cpSync(publicDir, outDir, { recursive: true });
cpSync(indexPath, join(outDir, 'index.html'));
cpSync(indexPath, join(outDir, '404.html'));

const basePath = getBasePath();
const rewrittenFiles = rewriteDeployFiles(basePath);

// GitHub Pages + SPA fallback:
// - Keep generated 404.html so deep links load the app shell.
// - Disable Jekyll processing to prevent underscore path issues.
writeFileSync(join(outDir, '.nojekyll'), '');

if (customDomain) {
  writeFileSync(join(outDir, 'CNAME'), `${customDomain}\n`);
}

if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');

  // On GitHub Pages, a stale service worker can outlive deploys.
  // Keep the current file but ensure cache keys are unique per build by stamping.
  const stamp = `\n// pages-build-stamp:${Date.now()}\n`;
  const rewritten = rewriteQuotedRootPaths(sw, basePath);
  writeFileSync(join(outDir, 'sw.js'), `${rewritten}${stamp}`);
}

console.log(
  `Prepared GitHub Pages artifact at ${outDir} with base path: ${basePath} (rewritten files: ${rewrittenFiles})${customDomain ? ` and CNAME: ${customDomain}` : ''}`
);
