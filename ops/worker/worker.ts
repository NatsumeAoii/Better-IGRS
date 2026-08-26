/**
 * IGRS Preview Worker — Cloudflare Worker for social media previews and the
 * same-origin Steam data proxy.
 *
 * Purpose:
 * - Serves Open Graph / oEmbed preview pages for game links shared on
 *   Discord, Slack, Telegram, Twitter, Facebook, and other platforms that fetch
 *   link metadata via bot user-agents (`/game/*` route).
 * - Proxies strict-allowlisted Steam store API reads (`/proxy/steam/*` route)
 *   so the browser app talks to its own origin instead of a third-party CORS
 *   proxy, with server-side response caching.
 *
 * Invoked: When a request matches the route patterns `igrs.madeby.my.id/game/*`
 * or `igrs.madeby.my.id/proxy/steam/*` (configured in wrangler.toml).
 *
 * Behavior:
 * - Bot user-agents receive a full HTML preview page with OG/Twitter meta tags.
 * - Normal browsers receive the SPA shell (fetched from the origin's /404.html,
 *   which is not Worker-routed, and re-served with a 200 status) so the React
 *   app renders the game detail page directly at /game/:id — no redirect loop.
 *   If the origin shell fetch fails, browsers fall back to the legacy
 *   /search/#id redirect.
 * - The `/game/{id}/oembed` path returns oEmbed JSON for rich embed consumers.
 * - The `/proxy/steam/{allowlisted-path}` path forwards GET requests to
 *   `https://store.steampowered.com` verbatim (path + query), never acting as
 *   an open relay.
 *
 * Deployment: `wrangler deploy` from this directory. See wrangler.toml for
 * route configuration and environment variables.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Environment bindings provided by wrangler.toml [vars] section. */
export interface WorkerEnv {
  SITE_ORIGIN?: string;
  GAMES_PATH?: string;
  META_PATH?: string;
}

/** Parsed route from the incoming request URL. */
export type GameRoute = DetailRoute | OEmbedRoute | SteamProxyRoute;

export interface DetailRoute {
  kind: 'detail';
  id: number;
}

export interface OEmbedRoute {
  kind: 'oembed';
  id: number;
}

/** Allowlisted Steam proxy pass-through; `path` starts with `/api/` or `/appreviews/`. */
export interface SteamProxyRoute {
  kind: 'steam-proxy';
  path: string;
}

/** Processed game data held in the module-level cache. */
export interface GameData {
  games: WorkerGame[];
  gamesById: Map<number, WorkerGame>;
  meta: WorkerMeta;
}

/** A single game entry from the IGRS games JSON. */
export interface WorkerGame {
  id: number;
  name: string;
  publisherName: string;
  releaseYear: number;
  description?: string;
  ratings?: number[];
  descriptors?: number[];
}

/** Metadata containing rating and descriptor lookup tables. */
export interface WorkerMeta {
  ratings: Record<string, { name?: string; color?: string }>;
  descriptors: Record<string, { nameEn?: string; nameId?: string }>;
}

/** Internal cache entry for loaded game data. */
interface DataCache {
  key: string;
  expiresAt: number;
  promise: Promise<GameData>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SITE_ORIGIN = 'https://igrs.madeby.my.id';
const GAMES_PATH = '/assets/data/json/igrs.games.json';
const META_PATH = '/assets/data/json/igrs.meta.json';
const DATA_CACHE_TTL_MS = 300_000;
const DATA_CACHE_MAX_GAMES = 50_000;
const DATA_FETCH_RETRIES = 1;
const DATA_FETCH_TIMEOUT_MS = 8_000;

// Steam proxy pass-through: hardcoded upstream origin — this endpoint must
// never become an open relay, so the incoming path never selects a host.
const STEAM_UPSTREAM_ORIGIN = 'https://store.steampowered.com';
const STEAM_PROXY_PREFIX = '/proxy/steam/';
// Only the prefixes actually produced by the Steam Checker client are allowed:
// /api/storesearch (search), /api/appdetails (store details), /appreviews (reviews).
const STEAM_PROXY_ALLOWED_PATH_RE = /^\/(api|appreviews)\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*$/;
const STEAM_PROXY_CACHE_TTL_SECONDS = 300;
const STEAM_PROXY_CLIENT_TTL_SECONDS = 60;
const STEAM_PROXY_TIMEOUT_MS = 8_000;
const STEAM_PROXY_RETRIES = 1;

const PREVIEW_BOT_RE =
  /(discordbot|discord|facebookexternalhit|slackbot|telegrambot|whatsapp|linkedinbot|embedly|skypeuripreview|twitterbot|pinterest|googlebot|bingbot|duckduckbot|yandexbot|crawler|spider|applebot|flipboard|redditbot|viber|line\/)/i;

const FALLBACK_RATING_COLORS: Record<number, string> = {
  7: '#22c55e',
  4: '#06b6d4',
  5: '#eab308',
  28: '#f97316',
  6: '#ef4444',
  35: '#64748b',
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let dataCache: DataCache | null = null;

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const siteOrigin = normalizeOrigin(env?.SITE_ORIGIN || DEFAULT_SITE_ORIGIN);
    const route = parseGameRoute(url.pathname, url.searchParams);

    if (!route) {
      return notFound();
    }

    if (route.kind === 'steam-proxy') {
      return serveSteamProxy(request, route.path, url.search);
    }

    if (route.kind === 'oembed') {
      return serveOEmbed(siteOrigin, route.id, env);
    }

    if (isPreviewBot(request.headers.get('user-agent') || '')) {
      return servePreviewPage(siteOrigin, route.id, env);
    }

    return serveSpaShell(siteOrigin, route.id);
  },
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function parseGameRoute(pathname: string, searchParams: URLSearchParams): GameRoute | null {
  const proxyPath = parseSteamProxyPath(pathname);
  if (proxyPath) return proxyPath;

  if (pathname === '/game' || pathname === '/game/') {
    const id = Number(searchParams.get('id'));
    if (Number.isFinite(id) && id > 0) return { kind: 'detail', id };
    return null;
  }

  const match = pathname.match(/^\/game\/(\d+)(?:\/(oembed))?\/?$/);
  if (!match) return null;

  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (match[2] === 'oembed') {
    return { kind: 'oembed', id };
  }

  return { kind: 'detail', id };
}

/**
 * Validates the Steam proxy sub-path and returns the upstream path to forward.
 * Returns null for anything outside the strict allowlist — including empty
 * paths, traversal segments, backslashes, and non-allowlisted prefixes.
 */
export function parseSteamProxyPath(pathname: string): SteamProxyRoute | null {
  if (!pathname.startsWith(STEAM_PROXY_PREFIX)) return null;

  const path = pathname.slice(STEAM_PROXY_PREFIX.length - 1); // keep leading '/'
  // Defense in depth: reject dot-segments and separators even though the URL
  // parser normalizes most of them before this function runs.
  if (path.length < 1 || path.includes('..') || path.includes('\\')) return null;
  if (!STEAM_PROXY_ALLOWED_PATH_RE.test(path)) return null;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.includes('..') || decoded.includes('\\')) return null;
  } catch {
    return null; // malformed percent-encoding
  }

  return { kind: 'steam-proxy', path };
}

// ---------------------------------------------------------------------------
// Bot detection
// ---------------------------------------------------------------------------

export function isPreviewBot(userAgent: string): boolean {
  return PREVIEW_BOT_RE.test(userAgent);
}

// ---------------------------------------------------------------------------
// Preview page generation
// ---------------------------------------------------------------------------

async function servePreviewPage(siteOrigin: string, id: number, env: WorkerEnv): Promise<Response> {
  const data = await loadGameData(siteOrigin, env);
  const game = data.gamesById.get(id);

  if (!game) {
    return htmlResponse(renderNotFoundPage(siteOrigin, id), 404, false, siteOrigin);
  }

  const ratingId = game.ratings?.[0];
  const rating = ratingId !== undefined ? data.meta.ratings?.[String(ratingId)] : undefined;
  const descriptors = (game.descriptors || [])
    .map((descriptorId) => data.meta.descriptors?.[String(descriptorId)])
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((descriptor) => descriptor.nameEn || descriptor.nameId || 'Unknown');

  const ratingText = rating?.name || (ratingId !== undefined ? `ID ${ratingId}` : 'Unknown');
  const descriptorText = descriptors.length ? descriptors.join(', ') : 'None';
  const publisherText = game.publisherName || 'Unknown publisher';
  const yearText = String(game.releaseYear || 'Unknown year');
  const shortDescription = truncate(
    normalizeWhitespace(game.description || 'No description available.'),
    170,
  );
  const description = `${shortDescription}\n\nRating: ${ratingText}\nDescriptors: ${descriptorText}`;
  const imageUrl =
    ratingId !== undefined
      ? `${siteOrigin}/assets/data/images/ratings/${ratingId}.png`
      : `${siteOrigin}/assets/icons/icon-512.png`;
  const shareUrl = `${siteOrigin}/game/${id}`;
  const pageUrl = `${siteOrigin}/game/${id}`;
  const oembedUrl = `${siteOrigin}/game/${id}/oembed`;
  const providerText = 'Data provided by IGRS.id';
  const authorText = `${publisherText} - ${yearText}`;
  const color = getRatingColor(ratingId, data.meta);

  return htmlResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(game.name)}</title>
  <link rel="canonical" href="${escapeAttr(pageUrl)}">
  <link type="application/json+oembed" href="${escapeAttr(oembedUrl)}" />
  <meta name="author" content="${escapeAttr(authorText)}">
  <meta name="theme-color" content="${color}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttr(game.name)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(shareUrl)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta property="og:image:alt" content="${escapeAttr(`${game.name} - ${ratingText}`)}">
  <meta property="og:site_name" content="${escapeAttr(providerText)}">
  <meta property="article:author" content="${escapeAttr(authorText)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(game.name)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
</head>
<body>
  <p>${escapeHtml(game.name)} • ${escapeHtml(authorText)}</p>
  <p><a href="${escapeAttr(shareUrl)}">Open this game in Better-IGRS</a></p>
</body>
</html>`,
    200,
    false,
    siteOrigin,
  );
}

// ---------------------------------------------------------------------------
// SPA shell pass-through (browser path)
// ---------------------------------------------------------------------------

/**
 * Serves the SPA shell to browsers at /game/:id with a 200 status.
 *
 * The shell is fetched from `${siteOrigin}/404.html` — a path deliberately NOT
 * covered by this Worker's route (`/game/*`), so the subrequest goes straight
 * to the Pages origin without re-entering the Worker (which would loop).
 * GitHub Pages would otherwise answer /game/:id with the 404.html fallback at
 * a 404 status; re-serving with 200 keeps analytics and crawlers sane.
 *
 * The 404.html entry uses root-absolute asset URLs (see the renderBuiltUrl
 * override in config/vite.config.ts), so the shell boots correctly at any
 * path depth.
 */
async function serveSpaShell(siteOrigin: string, id: number): Promise<Response> {
  try {
    const shell = await fetch(`${siteOrigin}/404.html`, {
      headers: { 'User-Agent': 'IGRS-Preview-Worker/1.0' },
    });
    if (!shell.ok || !shell.body) throw new Error(`Shell fetch failed (${shell.status})`);
    return new Response(shell.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // HTML is always revalidated so new deploys propagate immediately.
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; img-src 'self' https: data:; connect-src 'self' https://cors.mefi.workers.dev; form-action 'self'; upgrade-insecure-requests",
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=31536000',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Origin unreachable — fall back to the legacy hash-based detail view,
    // which is served without touching this Worker route.
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${siteOrigin}/search/#${id}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// oEmbed response
// ---------------------------------------------------------------------------

async function serveOEmbed(siteOrigin: string, id: number, env: WorkerEnv): Promise<Response> {
  const data = await loadGameData(siteOrigin, env);
  const game = data.gamesById.get(id);

  if (!game) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const payload = {
    version: '1.0',
    type: 'link',
    title: game.name || 'Unknown title',
    author_name: `${game.publisherName || 'Unknown publisher'} - ${game.releaseYear || 'Unknown year'}`,
    provider_name: 'Data provided by IGRS.id',
    provider_url: 'https://igrs.id',
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json+oembed; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---------------------------------------------------------------------------
// Steam proxy pass-through
// ---------------------------------------------------------------------------

function steamProxyCache(): Cache | undefined {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default;
  } catch {
    return undefined;
  }
}

/**
 * Serves `GET {origin}/proxy/steam/{allowlisted-path}` by forwarding to the
 * hardcoded Steam store origin with the query string verbatim, caching the
 * upstream JSON server-side (300s) and answering clients with a short TTL
 * (60s). Non-GET requests are rejected; failures return a generic no-store
 * JSON error.
 */
async function serveSteamProxy(request: Request, path: string, search: string): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Allow': 'GET',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const upstreamUrl = `${STEAM_UPSTREAM_ORIGIN}${path}${search}`;
  const cache = steamProxyCache();

  if (cache) {
    try {
      const cached = await cache.match(upstreamUrl);
      if (cached) {
        return withSteamProxyClientHeaders(cached.clone());
      }
    } catch {
      // Cache read failure must never break the proxy pass-through.
    }
  }

  let body: ArrayBuffer;
  try {
    body = await fetchWithBoundedRetry(upstreamUrl);
    // Steam occasionally answers 200 with an HTML interstitial; serving or
    // caching that as application/json would poison the client for the TTL.
    JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(JSON.stringify({ error: 'Steam request failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (cache) {
    try {
      await cache.put(
        upstreamUrl,
        new Response(body.slice(0), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${STEAM_PROXY_CACHE_TTL_SECONDS}`,
          },
        })
      );
    } catch {
      // Cache write failure must never break the proxy pass-through.
    }
  }

  return withSteamProxyClientHeaders(new Response(body));
}

function withSteamProxyClientHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', `public, max-age=${STEAM_PROXY_CLIENT_TTL_SECONDS}`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}

/** Mirrors fetchJsonAsset: bounded retries, linear delay, hard timeout. */
async function fetchWithBoundedRetry(url: string): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt <= STEAM_PROXY_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STEAM_PROXY_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IGRS-Preview-Worker/1.0' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Upstream responded ${response.status}`);
      return await response.arrayBuffer();
    } catch (error: unknown) {
      if (attempt >= STEAM_PROXY_RETRIES) throw error;
      await delay(120 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Steam upstream unreachable');
}

// ---------------------------------------------------------------------------
// Data loading and caching
// ---------------------------------------------------------------------------

function dataCacheKey(siteOrigin: string, env: WorkerEnv): string {
  return [siteOrigin, env?.GAMES_PATH || GAMES_PATH, env?.META_PATH || META_PATH].join('|');
}

async function loadGameData(siteOrigin: string, env: WorkerEnv): Promise<GameData> {
  const key = dataCacheKey(siteOrigin, env);
  const now = Date.now();

  if (dataCache?.key === key && dataCache.expiresAt > now) {
    return dataCache.promise;
  }

  const promise = fetchGameData(siteOrigin, env).catch((error: unknown) => {
    if (dataCache?.promise === promise) dataCache = null;
    throw error;
  });

  dataCache = { key, expiresAt: now + DATA_CACHE_TTL_MS, promise };
  return promise;
}

async function fetchGameData(siteOrigin: string, env: WorkerEnv): Promise<GameData> {
  const [gamesRes, metaRes] = await Promise.all([
    fetchJsonAsset<WorkerGame[]>(resolveUrl(siteOrigin, env?.GAMES_PATH || GAMES_PATH)),
    fetchJsonAsset<WorkerMeta>(resolveUrl(siteOrigin, env?.META_PATH || META_PATH)),
  ]);

  return buildGameData(gamesRes, metaRes);
}

async function fetchJsonAsset<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt <= DATA_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DATA_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IGRS-Preview-Worker/1.0' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Failed to load IGRS data (${response.status})`);
      return response.json() as Promise<T>;
    } catch (error: unknown) {
      if (attempt >= DATA_FETCH_RETRIES) throw error;
      await delay(120 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Failed to load IGRS data');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildGameData(games: unknown, meta: unknown): GameData {
  const gameList: WorkerGame[] = Array.isArray(games) ? (games as WorkerGame[]) : [];
  const gamesById = new Map<number, WorkerGame>();

  for (const game of gameList) {
    if (!Number.isFinite(game?.id) || gamesById.has(game.id)) continue;
    if (gamesById.size >= DATA_CACHE_MAX_GAMES) break;
    gamesById.set(game.id, game);
  }

  const safeMeta: WorkerMeta = isWorkerMeta(meta) ? meta : { ratings: {}, descriptors: {} };
  return { games: gameList, gamesById, meta: safeMeta };
}

function isWorkerMeta(value: unknown): value is WorkerMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ratings' in value &&
    'descriptors' in value
  );
}

// ---------------------------------------------------------------------------
// Rating color lookup
// ---------------------------------------------------------------------------

function getRatingColor(ratingId: number | undefined, meta: WorkerMeta): string {
  if (ratingId === undefined) return '#64748b';
  return meta.ratings?.[String(ratingId)]?.color || FALLBACK_RATING_COLORS[ratingId] || '#64748b';
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function truncate(value: string, limit: number): string {
  const text = normalizeWhitespace(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function normalizeOrigin(origin: string): string {
  return String(origin || DEFAULT_SITE_ORIGIN).replace(/\/$/, '');
}

function resolveUrl(siteOrigin: string, path: string): string {
  return new URL(path, siteOrigin).toString();
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Content-Security-Policy header value for HTML responses.
 * Scripts are blocked outright (`script-src 'none'`) — preview pages carry no
 * script by design; restricts images to the site origin, and prevents framing.
 */
export function buildCspHeader(siteOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${siteOrigin}`,
    "frame-ancestors 'none'",
  ].join('; ');
}

function htmlResponse(html: string, status = 200, cacheable = true, siteOrigin = DEFAULT_SITE_ORIGIN): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheable ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store',
      'Vary': 'User-Agent',
      'Content-Security-Policy': buildCspHeader(siteOrigin),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

function renderNotFoundPage(siteOrigin: string, id: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IGRS game not found</title>
  <meta http-equiv="refresh" content="0; url=${escapeAttr(`${siteOrigin}/search/`)}">
</head>
<body>
  <p>Game ${escapeHtml(String(id))} was not found.</p>
</body>
</html>`;
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
