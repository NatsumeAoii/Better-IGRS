/**
 * Search history store — persists recent search queries in `localStorage`
 * under the namespaced `igrs:search-history` key.
 *
 * Follows the module-store + `useSyncExternalStore` pattern established by
 * `use-recently-viewed.ts`. Storage is parsed defensively: only arrays of
 * non-empty strings are accepted, values are trimmed, duplicates are removed
 * case-insensitively (first occurrence wins — the list is most-recent-first),
 * and the list is capped at MAX_HISTORY_ITEMS. Blocked or full storage
 * degrades to in-memory state without crashing the UI.
 */
import { useSyncExternalStore } from 'react';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/shared/lib/browser-storage';

const SEARCH_HISTORY_KEY = 'igrs:search-history';
const MAX_HISTORY_ITEMS = 10;

/** Cached snapshot to maintain referential stability for useSyncExternalStore. */
let cachedRaw: string | null | undefined = undefined; // undefined = never read / invalidated
let cachedSnapshot: string[] = [];
let memorySnapshot: string[] | null = null;

/**
 * Case-insensitive duplicate key for a query.
 * Trimming happens here too so callers cannot insert whitespace-only noise.
 */
function dedupeKey(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Parse and validate a raw stored value.
 * Accepts only arrays of strings; trims, drops empties, deduplicates
 * case-insensitively, and caps at MAX_HISTORY_ITEMS.
 */
export function parseSearchHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = dedupeKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(trimmed);
    }
    return unique.slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Pure list reducer: commit a query, most-recent-first, case-insensitive
 * dedupe, capped. Empty or whitespace-only queries are ignored.
 * Exported for unit tests and reuse by the storage actions below.
 */
export function commitQueryToHistory(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [...list];
  const key = dedupeKey(trimmed);
  const filtered = list.filter(item => dedupeKey(item) !== key);
  return [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);
}

/**
 * Pure list reducer: remove a query (case-insensitive match).
 */
export function removeQueryFromHistory(list: readonly string[], query: string): string[] {
  const key = dedupeKey(query);
  return list.filter(item => dedupeKey(item) !== key);
}

function getSnapshot(): string[] {
  if (memorySnapshot !== null) return memorySnapshot;
  const raw = readLocalStorage(SEARCH_HISTORY_KEY);
  if (raw === cachedRaw && cachedRaw !== undefined) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseSearchHistory(raw);
  return cachedSnapshot;
}

function getServerSnapshot(): string[] {
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

function writeHistory(next: string[]): void {
  // Best effort persistence — a blocked or full store must not break the UI.
  const persisted = next.length > 0
    ? writeLocalStorage(SEARCH_HISTORY_KEY, JSON.stringify(next))
    : removeLocalStorage(SEARCH_HISTORY_KEY);
  memorySnapshot = persisted ? null : next;
  emitChange();
}

/** Commits a query to history (trimmed, deduped, capped). */
export function commitSearchQuery(query: string): void {
  writeHistory(commitQueryToHistory(getSnapshot(), query));
}

/** Removes one query from history (case-insensitive). */
export function removeSearchQuery(query: string): void {
  writeHistory(removeQueryFromHistory(getSnapshot(), query));
}

/** Clears all search history. */
export function clearSearchHistory(): void {
  writeHistory([]);
}

export interface SearchHistoryResult {
  /** Recent queries, most recent first. */
  history: string[];
  commitQuery: (query: string) => void;
  removeQuery: (query: string) => void;
  clearHistory: () => void;
  isEmpty: boolean;
}

/**
 * React hook exposing the shared search history store.
 */
export function useSearchHistory(): SearchHistoryResult {
  const history = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    history,
    commitQuery: commitSearchQuery,
    removeQuery: removeSearchQuery,
    clearHistory: clearSearchHistory,
    isEmpty: history.length === 0,
  };
}
