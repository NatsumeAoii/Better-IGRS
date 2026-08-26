/**
 * Framework-agnostic data client with stale-while-revalidate caching.
 *
 * Encapsulates all data fetching and caching logic so UI layers (React, etc.)
 * remain thin wrappers that subscribe to state changes.
 */

import { createDataCache, type DataCache } from '@/shared/api/data-cache';
import { loadIgrsData } from '@/shared/api/data-service';
import type { IgrsData } from '@/shared/types';

type Listener = (data: IgrsData, options: { unlocked: boolean }) => void;

export interface IgrsDataClient {
  /** Returns cached if fresh, serves stale while revalidating in background, fetches fresh if empty. */
  getData(options: { unlocked: boolean }): Promise<IgrsData>;
  /** Synchronous access to the current cache. Returns null if nothing is cached. */
  getCached(options: { unlocked: boolean }): IgrsData | null;
  /** Subscribe to data changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void;
}

/**
 * Creates a framework-agnostic IGRS data client with stale-while-revalidate caching.
 *
 * Maintains module-level caches keyed by unlocked state. Background revalidation
 * failures are silently swallowed — cached data is retained.
 */
export function createIgrsDataClient(): IgrsDataClient {
  const cacheByUnlocked: Record<'locked' | 'unlocked', DataCache<IgrsData>> = {
    locked: createDataCache<IgrsData>(),
    unlocked: createDataCache<IgrsData>(),
  };

  const revalidatingByState: Record<'locked' | 'unlocked', boolean> = {
    locked: false,
    unlocked: false,
  };
  const pendingRequestByState: Record<'locked' | 'unlocked', Promise<IgrsData> | null> = {
    locked: null,
    unlocked: null,
  };
  const listeners = new Set<Listener>();

  function getCacheForState(unlocked: boolean): DataCache<IgrsData> {
    return unlocked ? cacheByUnlocked.unlocked : cacheByUnlocked.locked;
  }

  function notify(data: IgrsData, unlocked: boolean): void {
    for (const listener of listeners) {
      listener(data, { unlocked });
    }
  }

  function getCached(options: { unlocked: boolean }): IgrsData | null {
    const cache = getCacheForState(options.unlocked);
    const entry = cache.get();
    return entry ? entry.data : null;
  }

  async function getData(options: { unlocked: boolean }): Promise<IgrsData> {
    const { unlocked } = options;
    const cache = getCacheForState(unlocked);
    const cached = cache.get();

    // Fresh cache → return immediately
    if (cached && cache.isFresh()) {
      return cached.data;
    }

    // Stale cache → serve stale immediately, revalidate in background
    if (cached && cache.isStale()) {
      const cacheState = unlocked ? 'unlocked' : 'locked';
      if (!revalidatingByState[cacheState]) {
        revalidatingByState[cacheState] = true;
        loadIgrsData({ unlocked })
          .then(nextData => {
            cache.set(nextData);
            notify(nextData, unlocked);
          })
          .catch(() => {
            // Graceful degradation: if revalidation fails, serve stale cache. This is intentional.
          })
          .finally(() => {
            revalidatingByState[cacheState] = false;
          });
      }
      return cached.data;
    }

    // No cache → fetch fresh. Deduplicate in-flight requests for same unlocked state.
    const cacheState = unlocked ? 'unlocked' : 'locked';
    if (pendingRequestByState[cacheState]) {
      return pendingRequestByState[cacheState];
    }

    const request = loadIgrsData({ unlocked })
      .then(nextData => {
        cache.set(nextData);
        notify(nextData, unlocked);
        return nextData;
      })
      .finally(() => {
        if (pendingRequestByState[cacheState] === request) {
          pendingRequestByState[cacheState] = null;
        }
      });

    pendingRequestByState[cacheState] = request;
    return request;
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { getData, getCached, subscribe };
}
