import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSearchHistory,
  commitQueryToHistory,
  commitSearchQuery,
  parseSearchHistory,
  removeQueryFromHistory,
  removeSearchQuery,
} from '@/features/search/use-search-history';

const KEY = 'igrs:search-history';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseSearchHistory (defensive parsing)', () => {
  it('returns an empty list for missing storage', () => {
    expect(parseSearchHistory(null)).toEqual([]);
  });

  it('returns an empty list for malformed JSON', () => {
    expect(parseSearchHistory('{{{')).toEqual([]);
  });

  it('returns an empty list when the value is not an array', () => {
    expect(parseSearchHistory(JSON.stringify({ q: 'x' }))).toEqual([]);
  });

  it('keeps only non-empty strings and trims them', () => {
    expect(parseSearchHistory(JSON.stringify(['  a  ', '', '   ', 42, 'b']))).toEqual(['a', 'b']);
  });

  it('removes duplicates case-insensitively, keeping the first occurrence', () => {
    expect(parseSearchHistory(JSON.stringify(['Halo', 'other', 'halo']))).toEqual(['Halo', 'other']);
  });

  it('caps the list at 10 entries', () => {
    const items = Array.from({ length: 15 }, (_, i) => `query-${i}`);
    expect(parseSearchHistory(JSON.stringify(items))).toHaveLength(10);
  });
});

describe('commitQueryToHistory (pure reducer)', () => {
  it('prepends a new query', () => {
    expect(commitQueryToHistory(['old'], 'new')).toEqual(['new', 'old']);
  });

  it('moves an existing query to the front, preserving the new casing', () => {
    expect(commitQueryToHistory(['old', 'stardew'], 'Stardew')).toEqual(['Stardew', 'old']);
  });

  it('ignores empty and whitespace-only queries', () => {
    expect(commitQueryToHistory(['old'], '')).toEqual(['old']);
    expect(commitQueryToHistory(['old'], '   ')).toEqual(['old']);
  });

  it('caps the list at 10 entries, dropping the oldest', () => {
    let list = Array.from({ length: 10 }, (_, i) => `q${i}`);
    list = commitQueryToHistory(list, 'fresh');
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('fresh');
    expect(list).not.toContain('q9');
  });
});

describe('removeQueryFromHistory (pure reducer)', () => {
  it('removes a query case-insensitively', () => {
    expect(removeQueryFromHistory(['Halo', 'other'], 'halo')).toEqual(['other']);
  });
});

describe('storage-backed actions', () => {
  it('persist committed queries to the namespaced key', () => {
    commitSearchQuery('hollow knight');
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual(['hollow knight']);
  });

  it('remove one query and clear empties the key', () => {
    commitSearchQuery('a');
    commitSearchQuery('b');
    removeSearchQuery('A');
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual(['b']);
    clearSearchHistory();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('degrade gracefully when storage reads or writes are blocked', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    expect(() => commitSearchQuery('blocked-query')).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();

    setItemSpy.mockRestore();
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    expect(parseSearchHistory(null)).toEqual([]);
    expect(() => commitSearchQuery('blocked-query')).not.toThrow();

    getItemSpy.mockRestore();
  });

  it('retains updates in memory after a blocked write', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    commitSearchQuery('blocked-query');
    setItemSpy.mockRestore();
    commitSearchQuery('next-query');

    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual(['next-query', 'blocked-query']);
  });
});
