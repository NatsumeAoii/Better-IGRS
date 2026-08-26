import {
  buildSteamSearchQueries,
  buildSteamStoreSearchUrl,
  normalizeSteamSearchPayload,
  selectSteamSearchResult
} from '@/core/steam-search';
import { buildSteamReviewsUrl, normalizeSteamReviewSummary } from '@/core/steam-reviews';
import { createAbortError, isAbortError } from '@/shared/lib/abort';
import type {
  IgrsGame,
  SteamAppDetailsPayload,
  SteamReviewSummary,
  SteamSearchResult
} from '@/shared/types';

export class SteamProxyError extends Error {
  readonly code = 'STEAM_PROXY_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SteamProxyError';
  }
}

export function isSteamProxyError(error: unknown): error is SteamProxyError {
  return error instanceof SteamProxyError;
}

const LEGACY_PROXY_BASE = 'https://cors.mefi.workers.dev/';
const OWN_PROXY_PATH = '/proxy/steam/';

/**
 * Proxy bases tried in order while the primary is unreachable.
 * The own same-origin Worker route comes first; the legacy third-party
 * CORS proxy stays as automatic fallback until it can be pruned.
 */
function defaultProxyBases(): string[] {
  const configured = import.meta.env.VITE_STEAM_PROXY_BASE?.trim();
  const own = configured || `${window.location.origin}${OWN_PROXY_PATH}`;
  return [own, LEGACY_PROXY_BASE].filter((base, index, all) => all.indexOf(base) === index);
}

type Translate = (key: string) => string;

interface SteamApiOptions {
  proxyAllowlist?: string[];
  proxyBase?: string;
  /** Explicit ordered proxy list (overrides derived defaults). */
  proxyBases?: string[];
  t?: Translate;
}

export interface SteamFetchOptions {
  retries?: number;
  signal?: AbortSignal;
}

/** Hard ceiling across all proxies and retries — bounded-retry discipline (#4.4). */
const MAX_TOTAL_ATTEMPTS = 4;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function proxiedUrl(url: string, proxyBase: string): string {
  return `${proxyBase}${url}`;
}

function normalizedHref(value: string): string {
  const url = new URL(value);
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export function normalizeSteamProxyBase(value?: string, allowlist: readonly string[] = [LEGACY_PROXY_BASE]): string {
  const candidate = value?.trim() || LEGACY_PROXY_BASE;
  let normalized: string;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') throw new Error('STEAM_PROXY_INSECURE');
    normalized = normalizedHref(url.href);
  } catch (error) {
    if (error instanceof Error && error.message === 'STEAM_PROXY_INSECURE') throw error;
    throw new Error('STEAM_PROXY_INVALID', { cause: error });
  }

  const allowed = new Set(allowlist.map(item => normalizedHref(item)));
  if (!allowed.has(normalized)) throw new Error('STEAM_PROXY_NOT_ALLOWED');
  return normalized;
}

function isAllowedProxyBase(base: string, allowlist: readonly string[]): boolean {
  try {
    normalizeSteamProxyBase(base, allowlist);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the ordered proxy base list:
 * - explicit `proxyBases` option wins (tests / advanced config),
 * - then a single explicit `proxyBase` or VITE_STEAM_PROXY_BASE,
 * - otherwise the derived default (same-origin Worker first, legacy fallback).
 * Insecure candidates (e.g. http dev origins without a configured proxy) are
 * dropped so local development keeps using the https third-party fallback.
 */
function resolveProxyBases(options: SteamApiOptions): string[] {
  if (options.proxyBases?.length) {
    const bases = options.proxyBases.map(base => {
      const url = new URL(base.trim());
      if (url.protocol !== 'https:') throw new Error('STEAM_PROXY_INSECURE');
      return normalizedHref(url.href);
    });
    return [...new Set(bases)];
  }

  const explicit = options.proxyBase || import.meta.env.VITE_STEAM_PROXY_BASE;
  if (explicit) return [normalizeSteamProxyBase(explicit, options.proxyAllowlist)];

  const allowlist = options.proxyAllowlist;
  // Validate https first (drops http dev origins), then the caller allowlist.
  const valid = defaultProxyBases().filter(base => isAllowedProxyBase(base, [base]));
  const filtered = allowlist ? valid.filter(base => isAllowedProxyBase(base, allowlist)) : valid;
  if (!filtered.length) throw new Error('STEAM_PROXY_NOT_ALLOWED');
  return filtered.map(base => normalizedHref(new URL(base).href));
}

function createLinkedAbortController(signal?: AbortSignal): { cleanup: () => void; controller: AbortController } {
  const controller = new AbortController();
  if (!signal) return { controller, cleanup: () => undefined };

  const abort = () => controller.abort();
  if (signal.aborted) {
    controller.abort();
    return { controller, cleanup: () => undefined };
  }

  signal.addEventListener('abort', abort, { once: true });
  return {
    controller,
    cleanup: () => signal.removeEventListener('abort', abort)
  };
}

export function createSteamApi(options: SteamApiOptions = {}) {
  const translate = typeof options.t === 'function' ? options.t : (() => 'Unable to load Steam data.');
  const proxyBases = resolveProxyBases(options);

  // Bounded LRU-style cache with TTL for Steam search results
  const CACHE_MAX_SIZE = 100;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const steamSearchCache = new Map<string, { expiresAt: number; promise: Promise<SteamSearchResult> }>();
  // Resolved (settled) results for synchronous peek — lets UI surfaces like
  // search result cards link directly to the Steam Checker without re-fetching.
  const steamSearchResolved = new Map<string, { expiresAt: number; result: SteamSearchResult }>();

  function getCachedResult(key: string): Promise<SteamSearchResult> | null {
    const entry = steamSearchCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      steamSearchCache.delete(key);
      steamSearchResolved.delete(key);
      return null;
    }
    return entry.promise;
  }

  function setCachedResult(key: string, promise: Promise<SteamSearchResult>): void {
    // Evict oldest entries if at capacity
    if (steamSearchCache.size >= CACHE_MAX_SIZE) {
      const firstKey = steamSearchCache.keys().next().value;
      if (firstKey !== undefined) {
        steamSearchCache.delete(firstKey);
        steamSearchResolved.delete(firstKey);
      }
    }
    steamSearchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
    // Track the settled value so peekSteamMatch can read it synchronously.
    void promise.then(
      result => { steamSearchResolved.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result }); },
      () => {
        // Only clear when this promise is still the current cache entry — a
        // newer request for the same key must not be clobbered by a stale rejection.
        if (steamSearchCache.get(key)?.promise === promise) steamSearchResolved.delete(key);
      }
    );
  }

  function isNetworkTypeError(error: unknown): boolean {
    return error instanceof TypeError
      && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
  }

  async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10000, fetchOptions: SteamFetchOptions = {}): Promise<T> {
    const retries = Number.isFinite(fetchOptions.retries) ? Math.max(0, fetchOptions.retries ?? 0) : 2;
    let lastError: unknown = null;
    let totalAttempts = 0;

    for (const proxyBase of proxyBases) {
      // Only a network-level failure of the whole proxy justifies moving to the
      // next base; upstream/HTTP errors are terminal for every base.
      let proxyUnreachable = false;

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (totalAttempts >= MAX_TOTAL_ATTEMPTS) break;
        totalAttempts += 1;
        const { controller, cleanup } = createLinkedAbortController(fetchOptions.signal);
        const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(proxiedUrl(url, proxyBase), { signal: controller.signal });
          if (!response.ok) throw new Error(translate('steamchecker.error.load'));

          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.includes('application/json')) {
            throw new Error(
              `Unexpected response format from proxy: expected application/json, got ${contentType || '(no content-type)'}`
            );
          }

          return await response.json() as T;
        } catch (error) {
          lastError = error;
          // Always propagate user-initiated abort immediately
          if (fetchOptions.signal?.aborted) {
            throw createAbortError();
          }

          if (isNetworkTypeError(error)) proxyUnreachable = true;

          if (attempt >= retries) break;
          // Both abort (internal timeout) and non-abort errors retry with backoff.
          // User-initiated abort is already handled above; remaining aborts are
          // from our internal timeout and should be retried like any transient error.
          const jitter = Math.floor(Math.random() * 80);
          await wait(Math.min(1200, 250 * (2 ** attempt)) + jitter);
        } finally {
          window.clearTimeout(timeout);
          cleanup();
        }
      }

      if (!proxyUnreachable) break;
      if (fetchOptions.signal?.aborted) throw createAbortError();
    }

    // Final check: if the caller's signal was aborted during the last iteration,
    // propagate abort instead of a generic proxy error
    if (fetchOptions.signal?.aborted) {
      throw createAbortError();
    }

    // Detect network/proxy errors for a more specific message (#4.4)
    if (lastError instanceof TypeError && (lastError.message.includes('Failed to fetch') || lastError.message.includes('NetworkError'))) {
      throw new SteamProxyError(translate('steamchecker.proxyUnreachable'));
    }

    throw new SteamProxyError(translate('steamchecker.error.load'));
  }

  async function fetchSteamReviewSummary(appId: string, fetchOptions: SteamFetchOptions = {}): Promise<SteamReviewSummary | null> {
    const reviewUrl = buildSteamReviewsUrl(appId);
    if (!reviewUrl) return null;
    try {
      const payload = await fetchJsonWithTimeout<unknown>(reviewUrl, 8000, { retries: 1, signal: fetchOptions.signal });
      return normalizeSteamReviewSummary(payload);
    } catch (error) {
      if (fetchOptions.signal?.aborted || isAbortError(error)) throw error;
      console.warn('Steam reviews failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async function findSteamMatchForGame(game: IgrsGame): Promise<SteamSearchResult> {
    const cacheKey = String(game.id || game.name || '');
    if (cacheKey) {
      const cached = getCachedResult(cacheKey);
      if (cached) return cached;
    }

    const searchPromise = (async () => {
      const candidatesById = new Map();
      const queries = buildSteamSearchQueries(game).slice(0, 4);
      const queryFailures: unknown[] = [];

      for (const query of queries) {
        const searchUrl = buildSteamStoreSearchUrl(query);
        if (!searchUrl) continue;
        try {
          const payload = await fetchJsonWithTimeout<unknown>(searchUrl, 6500, { retries: 0 });
          for (const candidate of normalizeSteamSearchPayload(payload)) {
            if (!candidatesById.has(candidate.appId)) candidatesById.set(candidate.appId, candidate);
          }
          const candidates = [...candidatesById.values()];
          const current = selectSteamSearchResult(game, candidates);
          if (current.status === 'match') return current;
        } catch (error) {
          queryFailures.push(error);
        }
      }

      const result = selectSteamSearchResult(game, [...candidatesById.values()]);
      if (result.status === 'none' && queryFailures.length) {
        const lastFailure = queryFailures[queryFailures.length - 1];
        console.warn('Steam search failed:', lastFailure instanceof Error ? lastFailure.message : lastFailure);
      }
      return result;
    })();

    if (cacheKey) setCachedResult(cacheKey, searchPromise);
    return searchPromise;
  }

  /**
   * Synchronously returns a previously resolved Steam match for a game, or null
   * when no settled, unexpired result exists. Never triggers a network request —
   * intended for cheap UI affordances (e.g., a direct Steam Checker link on
   * search cards) that appear only when the match is already known this session.
   */
  function peekSteamMatch(game: IgrsGame): SteamSearchResult | null {
    const cacheKey = String(game.id || game.name || '');
    if (!cacheKey) return null;
    const entry = steamSearchResolved.get(cacheKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      steamSearchResolved.delete(cacheKey);
      return null;
    }
    return entry.result;
  }

  /**
   * In-flight request deduplication for concurrent fetchSteamAppDetails calls.
   *
   * Protocol:
   * 1. When a request arrives for an appId already in the map, the caller joins
   *    the existing promise instead of starting a new fetch.
   * 2. Each joining caller increments `callerCount`.
   * 3. When a caller aborts (via its own AbortSignal), it decrements `callerCount`.
   *    If count reaches 0, the shared AbortController is aborted and the entry is removed.
   * 4. When the shared promise settles, the entry is removed regardless of outcome.
   *
   * This avoids duplicate network calls when multiple components request the same
   * Steam app details concurrently (e.g., game detail page + sidebar).
   */
  const inFlight = new Map<string, {
    promise: Promise<SteamAppDetailsPayload>;
    controller: AbortController;
    callerCount: number;
  }>();

  async function fetchSteamAppDetails(appId: string, fetchOptions: SteamFetchOptions = {}): Promise<SteamAppDetailsPayload> {
    const key = encodeURIComponent(appId);
    const callerSignal = fetchOptions.signal;

    // If there's already an in-flight request for this app ID, share it
    const existing = inFlight.get(key);
    if (existing) {
      if (existing.controller.signal.aborted || existing.callerCount <= 0) {
        inFlight.delete(key);
      } else {
        existing.callerCount += 1;

        return new Promise<SteamAppDetailsPayload>((resolve, reject) => {
          let settled = false;

          const onCallerAbort = () => {
            if (settled) return;
            settled = true;
            existing.callerCount -= 1;
            if (existing.callerCount <= 0) {
              inFlight.delete(key);
              existing.controller.abort();
            }
            reject(createAbortError());
          };

          if (callerSignal?.aborted) {
            onCallerAbort();
            return;
          }

          callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

          existing.promise.then(
            (value) => {
              if (!settled) {
                settled = true;
                callerSignal?.removeEventListener('abort', onCallerAbort);
                resolve(value);
              }
            },
            (error) => {
              if (!settled) {
                settled = true;
                callerSignal?.removeEventListener('abort', onCallerAbort);
                reject(error);
              }
            }
          );
        });
      }
    }

    // No in-flight request — create a new one
    if (callerSignal?.aborted) {
      return Promise.reject(createAbortError());
    }

    const controller = new AbortController();
    const entry = {
      promise: null as unknown as Promise<SteamAppDetailsPayload>,
      controller,
      callerCount: 1
    };

    const onFirstCallerAbort = () => {
      entry.callerCount -= 1;
      if (entry.callerCount <= 0) {
        inFlight.delete(key);
        entry.controller.abort();
      }
    };

    callerSignal?.addEventListener('abort', onFirstCallerAbort, { once: true });

    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}`;
    const sharedPromise = fetchJsonWithTimeout<SteamAppDetailsPayload>(
      url,
      10000,
      { signal: controller.signal }
    ).then(
      (value) => {
        inFlight.delete(key);
        callerSignal?.removeEventListener('abort', onFirstCallerAbort);
        return value;
      },
      (error) => {
        inFlight.delete(key);
        callerSignal?.removeEventListener('abort', onFirstCallerAbort);
        throw error;
      }
    );

    entry.promise = sharedPromise;
    inFlight.set(key, entry);

    return sharedPromise;
  }

  return {
    fetchJsonWithTimeout,
    fetchSteamAppDetails,
    fetchSteamReviewSummary,
    findSteamMatchForGame,
    peekSteamMatch
  };
}
