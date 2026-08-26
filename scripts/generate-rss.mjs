import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gamesPath = join(__dirname, '../public/assets/data/json/igrs.games.json');
const distDir = join(__dirname, '../dist');

console.log('Generating RSS feed...');

let games = [];
try {
  const content = readFileSync(gamesPath, 'utf-8');
  games = JSON.parse(content);
} catch (error) {
  console.error('[rss] Could not read games data:', error.message);
  process.exit(1);
}

// Sort by newest first (highest ID = most recently added)
const sorted = [...games].sort((a, b) => b.id - a.id);
const latest = sorted.slice(0, 20);

// Must match CNAME / canonical domain in index.html
const baseUrl = 'https://igrs.madeby.my.id';
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Better-IGRS - Latest Games</title>
    <link>${baseUrl}</link>
    <description>Latest game ratings from the Indonesian Game Rating System (IGRS) database.</description>
    <language>en</language>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${latest.map(game => `    <item>
      <title>${escapeXml(game.name)}</title>
      <link>${baseUrl}/game/${game.id}</link>
      <guid isPermaLink="true">${baseUrl}/game/${game.id}</guid>
      <description>Publisher: ${escapeXml(game.publisherName)} | Year: ${game.releaseYear}</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>`).join('\n')}
  </channel>
</rss>`;

const rssPath = join(distDir, 'rss.xml');
writeFileSync(rssPath, rss, 'utf-8');
console.log(`✓ Generated rss.xml with ${latest.length} latest games`);

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    return c;
  });
}
