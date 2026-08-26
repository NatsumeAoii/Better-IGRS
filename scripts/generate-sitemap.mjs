import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gamesPath = join(__dirname, '../public/assets/data/json/igrs.games.json');
const distDir = join(__dirname, '../dist');

console.log('Generating sitemap.xml...');

let games = [];
try {
  const content = readFileSync(gamesPath, 'utf-8');
  games = JSON.parse(content);
} catch (error) {
  console.error('[sitemap] Could not read games data:', error.message);
  process.exit(1);
}

// Must match CNAME / canonical domain in index.html
const baseUrl = 'https://igrs.madeby.my.id';
const staticRoutes = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/search/', priority: 0.9, changefreq: 'daily' },
  { url: '/ratings/', priority: 0.8, changefreq: 'weekly' },
  { url: '/steamchecker/', priority: 0.7, changefreq: 'weekly' },
];

const gameRoutes = games.map(game => ({
  url: `/game/${game.id}`,
  priority: 0.6,
  changefreq: 'weekly'
}));

const allRoutes = [...staticRoutes, ...gameRoutes];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  allRoutes.map(route => 
    `  <url>\n` +
    `    <loc>${baseUrl}${route.url}</loc>\n` +
    `    <priority>${route.priority}</priority>\n` +
    `    <changefreq>${route.changefreq}</changefreq>\n` +
    `  </url>`
  ).join('\n') +
  '\n</urlset>';

const sitemapPath = join(distDir, 'sitemap.xml');
writeFileSync(sitemapPath, xml, 'utf-8');
console.log(`✓ Generated sitemap.xml with ${allRoutes.length} URLs`);
