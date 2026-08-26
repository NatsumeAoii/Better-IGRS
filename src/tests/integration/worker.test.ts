// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import workerModule from '../../../ops/worker/worker.ts';

interface WorkerModule {
  fetch(request: Request, env: Record<string, string>): Promise<Response>;
}

const worker = workerModule as unknown as WorkerModule;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GAMES = [
  {
    id: 1,
    name: 'Test Game Alpha',
    publisherName: 'Studio One',
    releaseYear: 2024,
    ratings: [7],
    descriptors: [3, 5],
    description: 'A simple test game.',
  },
  {
    id: 2,
    name: 'Game <script>alert("xss")</script> Beta',
    publisherName: 'Publisher "Quoted" & <Special>',
    releaseYear: 2023,
    ratings: [6],
    descriptors: [2],
    description: 'Description with <b>HTML</b> & "quotes".',
  },
  {
    id: 99,
    name: 'Unicode Game 日本語',
    publisherName: 'パブリッシャー',
    releaseYear: 2025,
    ratings: [4],
    descriptors: [],
    description: 'ゲームの説明',
  },
];

const META = {
  ratings: {
    '7': { name: 'SU', color: '#22c55e' },
    '6': { name: '18+', color: '#ef4444' },
    '4': { name: '12+', color: '#06b6d4' },
  },
  descriptors: {
    '2': { nameEn: 'Violence', nameId: 'Kekerasan' },
    '3': { nameEn: 'Mild Language', nameId: 'Bahasa Ringan' },
    '5': { nameEn: 'Online', nameId: 'Daring' },
  },
};

const ENV = {
  SITE_ORIGIN: 'https://test.example.com',
  GAMES_PATH: '/data/games.json',
  META_PATH: '/data/meta.json',
};

const SPA_SHELL_HTML = '<!doctype html><html><head><title>Better-IGRS</title></head><body>SPA SHELL</body></html>';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const href = String(url);
    if (href === 'https://test.example.com/data/games.json') return jsonResponse(GAMES);
    if (href === 'https://test.example.com/data/meta.json') return jsonResponse(META);
    if (href === 'https://test.example.com/404.html') {
      return new Response(SPA_SHELL_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Route Parsing
// ---------------------------------------------------------------------------

describe('Route parsing', () => {
  it('handles /game/{id} as a valid detail route', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Test Game Alpha');
  });

  it('handles /game/{id}/oembed as a valid oEmbed route', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.title).toBe('Test Game Alpha');
  });

  it('handles /game?id={id} query parameter route', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game?id=1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Test Game Alpha');
  });

  it('returns 404 for invalid paths', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/invalid/path'),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 for /game without an id', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game'),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 for /game/ without an id', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/'),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 for /game/0 (non-positive id)', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/0', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 for /game/abc (non-numeric id)', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/abc'),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it('handles trailing slash on game route', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Bot Detection
// ---------------------------------------------------------------------------

describe('Bot detection', () => {
  const botUserAgents = [
    'Discordbot/2.0',
    'facebookexternalhit/1.1',
    'Slackbot-LinkExpanding 1.0',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.21.4.22',
    'LinkedInBot/1.0',
    'Twitterbot/1.0',
    'Googlebot/2.1',
    'bingbot/2.0',
    'DuckDuckBot/1.0',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Embedly/0.2',
  ];

  for (const ua of botUserAgents) {
    it(`serves preview HTML for bot: ${ua.slice(0, 30)}`, async () => {
      const response = await worker.fetch(
        new Request('https://worker.test/game/1', {
          headers: { 'user-agent': ua },
        }),
        ENV,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  }

  const normalBrowsers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];

  for (const ua of normalBrowsers) {
    it(`serves the SPA shell to normal browser: ${ua.slice(0, 40)}`, async () => {
      const response = await worker.fetch(
        new Request('https://worker.test/game/1', {
          headers: { 'user-agent': ua },
        }),
        ENV,
      );
      // Browsers get the SPA shell directly at /game/:id (no redirect loop).
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('SPA SHELL');
    });
  }

  it('falls back to the legacy hash redirect when the shell fetch fails', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/7', {
        headers: { 'user-agent': normalBrowsers[0] },
      }),
      { ...ENV, SITE_ORIGIN: 'https://missing.example.com' },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://missing.example.com/search/#7');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

// ---------------------------------------------------------------------------
// Preview HTML Generation
// ---------------------------------------------------------------------------

describe('Preview HTML generation', () => {
  it('includes Open Graph meta tags', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
    expect(html).toContain('og:image');
    expect(html).toContain('og:url');
  });

  it('includes Twitter card meta tags', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Twitterbot/1.0' },
      }),
      ENV,
    );
    const html = await response.text();
    expect(html).toContain('twitter:card');
    expect(html).toContain('twitter:title');
    expect(html).toContain('twitter:description');
  });

  it('includes oEmbed discovery link', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    expect(html).toContain('application/json+oembed');
    expect(html).toContain('/game/1/oembed');
  });

  it('keeps preview HTML stable for crawlers', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    expect(html).toContain('Open this game in Better-IGRS');
    expect(html).not.toContain('window.location.replace');
  });

  it('properly escapes game names with special characters', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/2', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    // Script tag in game name must be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    // Should contain escaped version
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
  });

  it('escapes publisher names with special characters in attributes', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/2', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    // Quotes and angle brackets in attributes must be escaped
    expect(html).not.toContain('content="Publisher "Quoted"');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;Special&gt;');
  });

  it('handles Unicode game names correctly', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/99', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const html = await response.text();
    expect(html).toContain('Unicode Game 日本語');
  });
});

// ---------------------------------------------------------------------------
// oEmbed JSON Response
// ---------------------------------------------------------------------------

describe('oEmbed JSON response', () => {
  it('returns valid oEmbed JSON structure', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      version: '1.0',
      type: 'link',
      title: 'Test Game Alpha',
      author_name: 'Studio One - 2024',
      provider_name: 'Data provided by IGRS.id',
      provider_url: 'https://igrs.id',
    });
  });

  it('sets correct content-type for oEmbed', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.headers.get('content-type')).toContain('application/json+oembed');
  });

  it('returns 404 JSON for non-existent game oEmbed', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/9999/oembed'),
      ENV,
    );
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// 404 Handling
// ---------------------------------------------------------------------------

describe('404 handling', () => {
  it('returns 404 HTML for non-existent game with bot user-agent', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/9999', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('not found');
    expect(html).toContain('9999');
  });

  it('returns plain 404 for completely invalid routes', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/unknown'),
      ENV,
    );
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe('Not Found');
  });

  it('escapes game ID in 404 HTML response', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/12345', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('12345');
  });
});

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

describe('Security headers', () => {
  it('includes CSP header on HTML preview responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    const csp = response.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain('img-src https://test.example.com');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('includes X-Content-Type-Options on HTML responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('includes X-Frame-Options on HTML responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('includes X-Content-Type-Options on oEmbed JSON responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does NOT include CSP on oEmbed JSON responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it('does NOT include X-Frame-Options on oEmbed JSON responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    expect(response.headers.get('x-frame-options')).toBeNull();
  });

  it('includes X-Content-Type-Options on 404 plain text responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/unknown'),
      ENV,
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('includes X-Content-Type-Options on SPA shell responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    // HTML shell must always revalidate so new deploys propagate immediately
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('includes CSP and X-Frame-Options on 404 HTML responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/9999', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

// ---------------------------------------------------------------------------
// Cache Headers
// ---------------------------------------------------------------------------

describe('Cache headers', () => {
  it('sets cache headers on oEmbed responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1/oembed'),
      ENV,
    );
    const cacheControl = response.headers.get('cache-control');
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age=300');
    expect(cacheControl).toContain('stale-while-revalidate');
  });

  it('sets no-store on 404 oEmbed responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/9999/oembed'),
      ENV,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sets Vary: User-Agent on HTML preview responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/1', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.headers.get('vary')).toBe('User-Agent');
  });

  it('sets no-store on 404 HTML responses', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/game/9999', {
        headers: { 'user-agent': 'Discordbot/2.0' },
      }),
      ENV,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// Steam proxy pass-through
// ---------------------------------------------------------------------------

const STEAM_UPSTREAM_JSON = JSON.stringify({ items: [{ id: 620, name: 'Portal', type: 'app' }] });

function fakeSteamCache() {
  const store = new Map<string, Response>();
  return {
    store,
    async match(request: Request | string) {
      const key = String(request);
      return store.get(key) ? store.get(key)!.clone() : undefined;
    },
    async put(request: Request | string, response: Response) {
      store.set(String(request), response.clone());
    },
  };
}

describe('Steam proxy route', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href === 'https://test.example.com/data/games.json') return jsonResponse(GAMES);
      if (href === 'https://test.example.com/data/meta.json') return jsonResponse(META);
      if (href.startsWith('https://store.steampowered.com/')) {
        return new Response(STEAM_UPSTREAM_JSON, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: fakeSteamCache() };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('forwards allowlisted paths to the hardcoded Steam origin with query verbatim', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/proxy/steam/api/storesearch/?term=portal&l=en&cc=US'),
      ENV,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(STEAM_UPSTREAM_JSON));
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects non-GET requests with 405 and no-store', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/proxy/steam/api/storesearch/?term=x', { method: 'POST' }),
      ENV,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 404 for non-allowlisted proxy sub-paths without touching upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(
      new Request('https://worker.test/proxy/steam/other'),
      ENV,
    );
    expect(response.status).toBe(404);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('steampowered'))).toBe(false);
  });

  it('caches upstream responses server-side and serves repeats from cache', async () => {
    const first = await worker.fetch(
      new Request('https://worker.test/proxy/steam/appreviews/620?json=1&filter=recent'),
      ENV,
    );
    expect(first.status).toBe(200);
    // Second identical request must be served without a second upstream fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const second = await worker.fetch(
      new Request('https://worker.test/proxy/steam/appreviews/620?json=1&filter=recent'),
      ENV,
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(JSON.parse(STEAM_UPSTREAM_JSON));
    // Zero upstream fetches after the cached first request — served from cache.
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).startsWith('https://store.steampowered.com')).length).toBe(0);
    expect(first.headers.get('cache-control')).toContain('max-age=60');
  });

  it('maps upstream failure to a generic 502 no-store error', async () => {
    globalThis.fetch = (async () => new Response('upstream down', { status: 503 })) as typeof fetch;
    const response = await worker.fetch(
      new Request('https://worker.test/proxy/steam/api/appdetails?appids=1'),
      ENV,
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const json = await response.json();
    expect(json.error).toBe('Steam request failed');
  });
});
