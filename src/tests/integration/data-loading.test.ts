import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadIgrsData } from '@/shared/api/data-service';

const MOCK_GAMES = [
  { id: 1, name: 'Test Game Alpha', publisherName: 'Studio One', releaseYear: 2024, ratings: [7], descriptors: [3], platforms: [1] },
  { id: 2, name: 'Beta Runner', publisherName: 'Studio Two', releaseYear: 2023, ratings: [4], descriptors: [], platforms: [2] },
  { id: 3, name: 'Gamma Quest', publisherName: 'Studio One', releaseYear: 2025, ratings: [6], descriptors: [2, 5], platforms: [1, 2] },
];

const MOCK_META = {
  meta: { generatedAt: '2025-01-01', totalGames: 3 },
  ratings: {
    '7': { name: 'SU', weight: 1, color: '#22c55e' },
    '4': { name: '12+', weight: 3, color: '#06b6d4' },
    '6': { name: '18+', weight: 5, color: '#ef4444' },
  },
  descriptors: {
    '2': { nameEn: 'Violence' },
    '3': { nameEn: 'Mild Language' },
    '5': { nameEn: 'Online' },
  },
  platforms: {
    '1': 'PC',
    '2': 'Console',
  },
};

const MOCK_STEAM_META = {
  contentDescriptors: {
    '101': { igrsDescriptorIds: [2], name: 'Violence' },
  },
};

const MOCK_EXTRA = {
  games: [
    { id: 1, videoUrl: 'https://example.com/video1.mp4', inGameUrl: 'https://example.com/ingame1' },
  ],
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('loadIgrsData', () => {
  it('loads games, builds gamesById map, and computes stats', async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('igrs.games.json')) return jsonResponse(MOCK_GAMES);
      if (href.includes('igrs.meta.json')) return jsonResponse(MOCK_META);
      if (href.includes('steam.meta.json')) return jsonResponse(MOCK_STEAM_META);
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const data = await loadIgrsData();

    expect(data.games).toHaveLength(3);
    expect(data.gamesById.size).toBe(3);
    expect(data.gamesById.get(1)?.name).toBe('Test Game Alpha');
    expect(data.gamesById.get(2)?.name).toBe('Beta Runner');
    expect(data.meta.ratings['7'].name).toBe('SU');
    expect(data.stats.publisherCount).toBe(2);
    expect(data.stats.platformCount).toBe(2);
    expect(data.steamMeta.contentDescriptors['101'].name).toBe('Violence');
  });

  it('handles games with missing optional fields', async () => {
    const minimalGames = [
      { id: 10, name: 'Minimal', publisherName: 'Pub', releaseYear: 2020 },
    ];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('igrs.games.json')) return jsonResponse(minimalGames);
      if (href.includes('igrs.meta.json')) return jsonResponse(MOCK_META);
      if (href.includes('steam.meta.json')) return jsonResponse({ contentDescriptors: {} });
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const data = await loadIgrsData();

    expect(data.games).toHaveLength(1);
    expect(data.games[0].ratings).toBeUndefined();
    expect(data.games[0].descriptors).toBeUndefined();
    expect(data.gamesById.get(10)?.name).toBe('Minimal');
  });

  it('merges extra data when unlocked=true', async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('igrs.games.json')) return jsonResponse(MOCK_GAMES);
      if (href.includes('igrs.meta.json')) return jsonResponse(MOCK_META);
      if (href.includes('steam.meta.json')) return jsonResponse({ contentDescriptors: {} });
      if (href.includes('igrs.extra.json')) return jsonResponse(MOCK_EXTRA);
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const data = await loadIgrsData({ unlocked: true });

    expect(data.games).toHaveLength(3);
    const game1 = data.gamesById.get(1);
    expect(game1?.videoUrl).toBe('https://example.com/video1.mp4');
    expect(game1?.inGameUrl).toBe('https://example.com/ingame1');
  });

  it('does not fetch extra data when unlocked=false', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('igrs.games.json')) return jsonResponse(MOCK_GAMES);
      if (href.includes('igrs.meta.json')) return jsonResponse(MOCK_META);
      if (href.includes('steam.meta.json')) return jsonResponse({ contentDescriptors: {} });
      return new Response('Not found', { status: 404 });
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    await loadIgrsData({ unlocked: false });

    const calls = fetchSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(u => u.includes('igrs.extra.json'))).toBe(false);
  });

  it('builds gamesByNormalizedName for exact lookups', async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('igrs.games.json')) return jsonResponse(MOCK_GAMES);
      if (href.includes('igrs.meta.json')) return jsonResponse(MOCK_META);
      if (href.includes('steam.meta.json')) return jsonResponse({ contentDescriptors: {} });
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const data = await loadIgrsData();

    expect(data.gamesByNormalizedName.size).toBe(3);
    // Normalized names should be lowercased
    const keys = [...data.gamesByNormalizedName.keys()];
    expect(keys).toContain('testgamealpha');
    expect(keys).toContain('betarunner');
  });
});
