import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSteamApi, isSteamProxyError } from '@/shared/api/steam-api';
import type { IgrsGame } from '@/shared/types';

const TEST_PROXY_BASE = 'https://cors.mefi.workers.dev/';

const game: IgrsGame = {
  id: 2682120,
  name: 'Bioskop Simulator / Movie Cinema Simulator',
  publisherName: 'Test Publisher',
  releaseYear: 2026,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSteamApi', () => {
  it('uses the Worker proxy route with the upstream path and query', async () => {
    const workerProxyBase = 'https://igrs.test/proxy/steam/';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      2391960: { success: true, data: { name: 'Steam Game' } },
    }));
    const api = createSteamApi({ proxies: [{ base: workerProxyBase, mode: 'path' }] });

    await api.fetchSteamAppDetails('2391960');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://igrs.test/proxy/steam/api/appdetails?appids=2391960',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('keeps legacy proxy bases in full-URL mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ value: 1 }));
    const api = createSteamApi({ proxyBase: TEST_PROXY_BASE, proxyAllowlist: [TEST_PROXY_BASE] });

    await api.fetchJsonWithTimeout('https://store.steampowered.com/api/appdetails?appids=2391960', 1000, { retries: 0 });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cors.mefi.workers.dev/https://store.steampowered.com/api/appdetails?appids=2391960',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('falls back when a static host returns 404 for the Worker proxy route', async () => {
    const workerProxyBase = 'https://pages.test/proxy/steam/';
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ value: 1 }));
    const api = createSteamApi({
      proxies: [
        { base: workerProxyBase, mode: 'path' },
        { base: TEST_PROXY_BASE, mode: 'url' },
      ],
    });

    await expect(
      api.fetchJsonWithTimeout<unknown>('https://store.steampowered.com/api/x', 1000, { retries: 0 })
    ).resolves.toEqual({ value: 1 });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://pages.test/proxy/steam/api/x',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://cors.mefi.workers.dev/https://store.steampowered.com/api/x',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('starts a fresh details request when the previous same-app caller was aborted before cleanup settles', async () => {
    const firstFetch = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce((_url, init) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          firstFetch.reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
        return firstFetch.promise;
      })
      .mockResolvedValueOnce(jsonResponse({
        2391960: { success: true, data: { name: 'Recovered Steam Game' } },
      }));

    const api = createSteamApi({
      proxyAllowlist: [TEST_PROXY_BASE],
      proxyBase: TEST_PROXY_BASE,
    });
    const firstCaller = new AbortController();
    const firstPromise = api
      .fetchSteamAppDetails('2391960', { signal: firstCaller.signal })
      .catch(error => error);

    firstCaller.abort();
    const secondPromise = api.fetchSteamAppDetails('2391960');

    await expect(secondPromise).resolves.toEqual({
      2391960: { success: true, data: { name: 'Recovered Steam Game' } },
    });
    await expect(firstPromise).resolves.toBeInstanceOf(DOMException);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not warn when Steam search recovers from one failed query and finds a later match', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('temporary proxy failure'))
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: 2682120, name: 'Movie Cinema Simulator', type: 'app' }],
      }));

    const api = createSteamApi({
      proxyAllowlist: [TEST_PROXY_BASE],
      proxyBase: TEST_PROXY_BASE,
    });

    const result = await api.findSteamMatchForGame(game);

    expect(result.status).toBe('match');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('multi-proxy failover', () => {
  const PRIMARY = 'https://primary.test/';
  const FALLBACK = 'https://fallback.test/';

  function failoverApi(t?: (key: string) => string) {
    return createSteamApi({ proxyBases: [PRIMARY, FALLBACK], ...(t ? { t } : {}) });
  }

  it('succeeds via the secondary proxy when the primary is unreachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ value: 1 }));

    const result = await failoverApi().fetchJsonWithTimeout<unknown>('https://store.steampowered.com/api/x', 1000, { retries: 0 });

    expect(result).toEqual({ value: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetchSpy).mock.calls[0][0])).toContain(PRIMARY);
    expect(String(vi.mocked(fetchSpy).mock.calls[1][0])).toContain(FALLBACK);
  });

  it('does not advance to the next proxy for non-network errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

    await expect(
      failoverApi().fetchJsonWithTimeout('https://store.steampowered.com/api/x', 1000, { retries: 0 })
    ).rejects.toThrow();

    // Single base only — a bad upstream response must not punish the fallback.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws SteamProxyError (proxy unreachable) when every proxy fails at network level', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      await failoverApi(k => k).fetchJsonWithTimeout('https://store.steampowered.com/api/x', 1000, { retries: 1 });
      expect.unreachable('expected rejection');
    } catch (error) {
      expect(isSteamProxyError(error)).toBe(true);
    }
  });

  it('caps total network attempts across proxies at four', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      failoverApi().fetchJsonWithTimeout('https://store.steampowered.com/api/x', 1000, { retries: 5 })
    ).rejects.toThrow();

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('propagates user abort raised during the fallback attempt', async () => {
    const caller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
      }));

    const settled = failoverApi()
      .fetchJsonWithTimeout('https://store.steampowered.com/api/x', 10_000, { retries: 0, signal: caller.signal })
      .catch(error => error);

    // Wait until the fallback proxy request is actually in flight.
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    caller.abort();

    const error = await settled;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });
});
