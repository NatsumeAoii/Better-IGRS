/**
 * Favorites store — manages favorite game IDs in `localStorage` under the
 * namespaced `igrs:favorites` key.
 *
 * Follows the module-store + `useSyncExternalStore` pattern established by
 * `use-recently-viewed.ts` so every consumer (game cards, detail views, the
 * favorites page) stays in sync without a React context provider.
 *
 * Storage is parsed defensively: only arrays of positive integers are
 * accepted, duplicates are removed (last occurrence wins), and the list is
 * capped at MAX_FAVORITES. Blocked or full storage degrades to in-memory
 * state without crashing the UI.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/shared/lib/browser-storage';

const FAVORITES_KEY = 'igrs:favorites';
const MAX_FAVORITES = 50;

/** Cached snapshot to maintain referential stability for useSyncExternalStore. */
let cachedRaw: string | null | undefined = undefined; // undefined = never read / invalidated
let cachedSnapshot: number[] = [];
let memorySnapshot: number[] | null = null;

/**
 * Parse and validate a raw stored value.
 * Accepts only arrays of positive integers; drops everything else,
 * deduplicates (last occurrence wins), and caps at MAX_FAVORITES.
 */
export function parseFavoriteIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((id): id is number =>
      typeof id === 'number' && Number.isInteger(id) && id > 0
    );
    const seen = new Set<number>();
    const unique: number[] = [];
    for (const id of valid) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique.slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

/**
 * Pure list reducer: toggle membership, most-recent-first, capped.
 * Exported for unit tests and reuse by the storage actions below.
 */
export function toggleFavoriteId(list: readonly number[], id: number): number[] {
  if (!Number.isInteger(id) || id <= 0) return [...list];
  if (list.includes(id)) return list.filter(favoriteId => favoriteId !== id);
  return [id, ...list].slice(0, MAX_FAVORITES);
}

function getSnapshot(): number[] {
  if (memorySnapshot !== null) return memorySnapshot;
  const raw = readLocalStorage(FAVORITES_KEY);
  if (raw === cachedRaw && cachedRaw !== undefined) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseFavoriteIds(raw);
  return cachedSnapshot;
}

function getServerSnapshot(): number[] {
  return [];
}

let listeners: Array<() => void> = [];

function emitChange(): void {
  cachedRaw = undefined;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function writeFavorites(next: number[]): void {
  // Best effort persistence — a blocked or full store must not break the UI.
  const persisted = next.length > 0
    ? writeLocalStorage(FAVORITES_KEY, JSON.stringify(next))
    : removeLocalStorage(FAVORITES_KEY);
  memorySnapshot = persisted ? null : next;
  emitChange();
}

/** Adds a game ID to favorites (no-op when already present or invalid). */
export function addFavoriteId(id: number): void {
  if (!Number.isInteger(id) || id <= 0 || getSnapshot().includes(id)) return;
  writeFavorites(toggleFavoriteId(getSnapshot(), id));
}

/** Removes a game ID from favorites (no-op when absent or invalid). */
export function removeFavoriteId(id: number): void {
  if (!Number.isInteger(id) || id <= 0 || !getSnapshot().includes(id)) return;
  writeFavorites(getSnapshot().filter(favoriteId => favoriteId !== id));
}

/** Toggles a game ID's favorite membership. */
export function toggleFavoriteIdInStore(id: number): void {
  if (!Number.isInteger(id) || id <= 0) return;
  writeFavorites(toggleFavoriteId(getSnapshot(), id));
}

/** Clears all favorites. */
export function clearFavoriteIds(): void {
  writeFavorites([]);
}

export interface UseFavoritesResult {
  /** Favorite game IDs, most recently added first. */
  favorites: number[];
  /** Whether a game ID is favorited. */
  isFavorite: (id: number) => boolean;
  addFavorite: (id: number) => void;
  removeFavorite: (id: number) => void;
  toggleFavorite: (id: number) => void;
  clearAll: () => void;
  count: number;
  isEmpty: boolean;
}

/**
 * React hook exposing the shared favorites store.
 * All mounted consumers re-render in sync when any of them toggles a game.
 */
export function useFavorites(): UseFavoritesResult {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isFavorite = useCallback(
    (id: number) => favorites.includes(id),
    [favorites]
  );

  return {
    favorites,
    isFavorite,
    addFavorite: addFavoriteId,
    removeFavorite: removeFavoriteId,
    toggleFavorite: toggleFavoriteIdInStore,
    clearAll: clearFavoriteIds,
    count: favorites.length,
    isEmpty: favorites.length === 0,
  };
}
