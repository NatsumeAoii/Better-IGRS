import { useState } from 'react';
import { useLanguage } from '@/app/providers/language-provider';
import type { createSteamApi } from '@/shared/api/steam-api';

type SteamApi = ReturnType<typeof createSteamApi>;

// Module-level lazy loader: the steam-api chunk (store details, reviews, and
// search clients) is downloaded only when a Steam lookup is actually performed,
// not on initial page load. The created instance is cached so its internal
// LRU cache and in-flight dedup persist across calls.
let steamApiPromise: Promise<SteamApi> | null = null;
let resolvedSteamApi: SteamApi | null = null;

function loadSteamApi(t: (key: string) => string): Promise<SteamApi> {
  if (!steamApiPromise) {
    steamApiPromise = import('@/shared/api/steam-api').then(m => {
      resolvedSteamApi = m.createSteamApi({ t });
      return resolvedSteamApi;
    });
  }
  return steamApiPromise;
}

export function useSteamApi(): SteamApi {
  const { t } = useLanguage();
  // Stable facade exposing the exact steam-api surface. Each method lazily
  // loads the real implementation on first call; identity never changes,
  // so downstream memoization/effects are unaffected.
  const [api] = useState<SteamApi>(() => ({
    fetchJsonWithTimeout: ((...args: Parameters<SteamApi['fetchJsonWithTimeout']>) =>
      loadSteamApi(t).then(real => real.fetchJsonWithTimeout(...args))) as SteamApi['fetchJsonWithTimeout'],
    fetchSteamAppDetails: (...args) =>
      loadSteamApi(t).then(real => real.fetchSteamAppDetails(...args)),
    fetchSteamReviewSummary: (...args) =>
      loadSteamApi(t).then(real => real.fetchSteamReviewSummary(...args)),
    findSteamMatchForGame: (...args) =>
      loadSteamApi(t).then(real => real.findSteamMatchForGame(...args)),
    // Synchronous peek: only possible once the real module has loaded.
    peekSteamMatch: game => resolvedSteamApi?.peekSteamMatch(game) ?? null,
  }));
  return api;
}
