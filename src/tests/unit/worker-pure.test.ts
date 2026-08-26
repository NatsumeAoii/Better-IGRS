// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseGameRoute,
  parseSteamProxyPath,
  isPreviewBot,
  escapeHtml,
  escapeAttr,
  truncate,
  buildGameData,
  buildCspHeader,
} from '../../../ops/worker/worker.ts';

describe('parseGameRoute', () => {
  it('parses /game/{id} as detail route', () => {
    expect(parseGameRoute('/game/42', new URLSearchParams())).toEqual({ kind: 'detail', id: 42 });
  });

  it('parses /game/{id}/oembed as oembed route', () => {
    expect(parseGameRoute('/game/42/oembed', new URLSearchParams())).toEqual({ kind: 'oembed', id: 42 });
  });

  it('parses /game?id={id} query parameter route', () => {
    expect(parseGameRoute('/game', new URLSearchParams('id=7'))).toEqual({ kind: 'detail', id: 7 });
  });

  it('handles trailing slash', () => {
    expect(parseGameRoute('/game/5/', new URLSearchParams())).toEqual({ kind: 'detail', id: 5 });
  });

  it('returns null for /game without id', () => {
    expect(parseGameRoute('/game', new URLSearchParams())).toBeNull();
  });

  it('returns null for /game/ without id', () => {
    expect(parseGameRoute('/game/', new URLSearchParams())).toBeNull();
  });

  it('returns null for non-positive id', () => {
    expect(parseGameRoute('/game/0', new URLSearchParams())).toBeNull();
    expect(parseGameRoute('/game/-1', new URLSearchParams())).toBeNull();
  });

  it('returns null for non-numeric id', () => {
    expect(parseGameRoute('/game/abc', new URLSearchParams())).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(parseGameRoute('/about', new URLSearchParams())).toBeNull();
    expect(parseGameRoute('/', new URLSearchParams())).toBeNull();
  });
});

describe('parseSteamProxyPath', () => {
  it('parses allowlisted Steam API prefixes', () => {
    expect(parseSteamProxyPath('/proxy/steam/api/appdetails?x'.split('?')[0])).toEqual({
      kind: 'steam-proxy',
      path: '/api/appdetails',
    });
    expect(parseSteamProxyPath('/proxy/steam/api/storesearch/')).toEqual({
      kind: 'steam-proxy',
      path: '/api/storesearch/',
    });
    expect(parseSteamProxyPath('/proxy/steam/appreviews/620')).toEqual({
      kind: 'steam-proxy',
      path: '/appreviews/620',
    });
  });

  it('returns null for empty or non-allowlisted sub-paths', () => {
    expect(parseSteamProxyPath('/proxy/steam')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/other')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/api')).toBeNull();
  });

  it('rejects traversal and encoded traversal attempts', () => {
    expect(parseSteamProxyPath('/proxy/steam/api/../other')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/%2e%2e/other')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/api/%2E%2E/x')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/api/..%2fother')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/api/back\\slash')).toBeNull();
    expect(parseSteamProxyPath('/proxy/steam/api/malformed%zz')).toBeNull();
  });

  it('returns null for unrelated prefixes', () => {
    expect(parseSteamProxyPath('/game/1')).toBeNull();
    expect(parseSteamProxyPath('/proxy/other/api/x')).toBeNull();
  });
});

describe('isPreviewBot', () => {
  it('matches common bot user agents', () => {
    expect(isPreviewBot('Discordbot/2.0')).toBe(true);
    expect(isPreviewBot('facebookexternalhit/1.1')).toBe(true);
    expect(isPreviewBot('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isPreviewBot('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isPreviewBot('WhatsApp/2.21.4.22')).toBe(true);
    expect(isPreviewBot('Twitterbot/1.0')).toBe(true);
    expect(isPreviewBot('Googlebot/2.1')).toBe(true);
    expect(isPreviewBot('bingbot/2.0')).toBe(true);
  });

  it('does not match normal browser user agents', () => {
    expect(isPreviewBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0')).toBe(false);
    expect(isPreviewBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBe(false);
    expect(isPreviewBot('')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('handles combined special characters', () => {
    expect(escapeHtml('<b>"x"&\'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('escapeAttr', () => {
  it('behaves identically to escapeHtml', () => {
    const inputs = ['<script>', 'a&b', '"q"', "it's"];
    for (const input of inputs) {
      expect(escapeAttr(input)).toBe(escapeHtml(input));
    }
  });
});

describe('truncate', () => {
  it('returns text under limit unchanged', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('truncates text over limit with ellipsis', () => {
    const result = truncate('a'.repeat(200), 170);
    expect(result.length).toBeLessThanOrEqual(170);
    expect(result).toMatch(/\.\.\.$/);
  });

  it('normalizes whitespace before truncating', () => {
    expect(truncate('  hello   world  ', 100)).toBe('hello world');
  });

  it('handles exact limit', () => {
    const text = 'a'.repeat(50);
    expect(truncate(text, 50)).toBe(text);
  });
});

describe('buildGameData', () => {
  it('builds game data from valid arrays', () => {
    const games = [
      { id: 1, name: 'Game A', publisherName: 'Pub', releaseYear: 2024 },
      { id: 2, name: 'Game B', publisherName: 'Pub', releaseYear: 2023 },
    ];
    const meta = { ratings: { '7': { name: 'SU' } }, descriptors: {} };
    const result = buildGameData(games, meta);
    expect(result.games).toHaveLength(2);
    expect(result.gamesById.get(1)?.name).toBe('Game A');
    expect(result.gamesById.get(2)?.name).toBe('Game B');
    expect(result.meta.ratings['7'].name).toBe('SU');
  });

  it('handles non-array games input', () => {
    const result = buildGameData(null, { ratings: {}, descriptors: {} });
    expect(result.games).toEqual([]);
    expect(result.gamesById.size).toBe(0);
  });

  it('falls back to empty meta when invalid', () => {
    const result = buildGameData([], null);
    expect(result.meta).toEqual({ ratings: {}, descriptors: {} });
  });

  it('deduplicates by id', () => {
    const games = [
      { id: 1, name: 'First', publisherName: 'Pub', releaseYear: 2024 },
      { id: 1, name: 'Duplicate', publisherName: 'Pub', releaseYear: 2024 },
    ];
    const result = buildGameData(games, { ratings: {}, descriptors: {} });
    expect(result.gamesById.size).toBe(1);
    expect(result.gamesById.get(1)?.name).toBe('First');
  });
});

describe('buildCspHeader', () => {
  it('generates correct CSP directives with scripts blocked outright', () => {
    const csp = buildCspHeader('https://example.com');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain('img-src https://example.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('nonce-');
  });

  it('separates directives with semicolons', () => {
    const csp = buildCspHeader('https://example.com');
    const parts = csp.split('; ');
    expect(parts.length).toBe(5);
  });
});
