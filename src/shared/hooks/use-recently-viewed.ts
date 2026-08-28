import { useCallback, useSyncExternalStore } from 'react';
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from '@/shared/lib/browser-storage';

const STORAGE_KEY = 'igrs-recent';
const MAX_ITEMS = 8;

/** Cached snapshot to maintain referential stability for useSyncExternalStore */
let cachedRaw: string | null | undefined = undefined; // undefined = never read / invalidated
let cachedSnapshot: number[] = [];

export function parseRecentlyViewedIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const valid: number[] = [];
    for (const id of parsed) {
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      valid.push(id);
    }
    return valid.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function getSnapshot(): number[] {
  const raw = readSessionStorage(STORAGE_KEY);
  if (raw === cachedRaw && cachedRaw !== undefined) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseRecentlyViewedIds(raw);
  return cachedSnapshot;
}

function getServerSnapshot(): number[] {
  return [];
}

let listeners: Array<() => void> = [];

function emitChange(): void {
  // Invalidate cache by resetting to undefined, forcing re-read from sessionStorage
  cachedRaw = undefined;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/**
 * Records a game ID as recently viewed.
 * Moves it to the front if already present, caps at MAX_ITEMS.
 */
export function recordRecentlyViewed(gameId: number): void {
  if (!Number.isFinite(gameId) || gameId <= 0) return;
  const current = parseRecentlyViewedIds(readSessionStorage(STORAGE_KEY));
  const next = [gameId, ...current.filter(id => id !== gameId)].slice(0, MAX_ITEMS);
  writeSessionStorage(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

/**
 * Removes all entries from the recently viewed storage.
 * Usable in both product code (e.g., a "clear history" button) and tests.
 */
export function clearRecentlyViewed(): void {
  removeSessionStorage(STORAGE_KEY);
  emitChange();
}

/**
 * React hook that returns the list of recently viewed game IDs (most recent first).
 */
export function useRecentlyViewed(): number[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns a stable callback to record a recently viewed game.
 */
export function useRecordRecentlyViewed(): (gameId: number) => void {
  return useCallback((gameId: number) => recordRecentlyViewed(gameId), []);
}
