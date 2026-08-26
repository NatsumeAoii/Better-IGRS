#!/usr/bin/env node
'use strict';

/**
 * Dist Structure Check (post-build gate)
 *
 * Asserts the artifacts that production serving depends on exist in dist/
 * after `npm run build`. Runs as the final step of `npm run check` — unlike
 * the pre-build structure tests, this one can verify build outputs directly.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function assert(condition, message) {
  if (!condition) {
    console.error(`\x1b[31m✗ ${message}\x1b[0m`);
    process.exit(1);
  }
}

assert(fs.existsSync(DIST), 'dist/: missing — run npm run build first');

for (const relativePath of [
  'index.html',
  '404.html',
  'sw.js',
  'CNAME',
  '_headers',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'rss.xml',
  'ratings/index.html',
  'search/index.html',
  'steamchecker/index.html',
  'assets/data/json/igrs.meta.json',
  'assets/data/json/igrs.games.json',
]) {
  assert(fs.existsSync(path.join(DIST, relativePath)), `dist/${relativePath}: missing from build output`);
}

// The service worker must stay dependency-free and carry its kill-switch.
const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
assert(sw.includes('igrs-shell-'), 'dist/sw.js: expected versioned cache names');
assert(!/\brequire\(|\bimport\s/.test(sw.replace(/^\/\/.*$/gm, '')), 'dist/sw.js: must remain a classic script without module syntax');

console.log('\x1b[32m✓ dist structure check passed\x1b[0m');
