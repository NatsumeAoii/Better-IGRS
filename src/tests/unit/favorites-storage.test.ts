import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFavoriteId,
  clearFavoriteIds,
  parseFavoriteIds,
  removeFavoriteId,
  toggleFavoriteId,
} from '@/shared/hooks/use-favorites';

const KEY = 'igrs:favorites';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseFavoriteIds (defensive parsing)', () => {
  it('returns an empty list for missing storage', () => {
    expect(parseFavoriteIds(null)).toEqual([]);
  });

  it('returns an empty list for malformed JSON', () => {
    expect(parseFavoriteIds('not-json{')).toEqual([]);
  });

  it('returns an empty list when the value is not an array', () => {
    expect(parseFavoriteIds(JSON.stringify({ ids: [1] }))).toEqual([]);
  });

  it('keeps only positive integers and drops everything else', () => {
    expect(parseFavoriteIds(JSON.stringify([1, '2', 3.5, -4, 0, null, 7]))).toEqual([1, 7]);
  });

  it('removes duplicates keeping the first (most recent) occurrence', () => {
    expect(parseFavoriteIds(JSON.stringify([3, 1, 3, 2, 1]))).toEqual([3, 1, 2]);
  });

  it('caps the list at 50 entries', () => {
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(parseFavoriteIds(JSON.stringify(ids))).toHaveLength(50);
  });
});

describe('toggleFavoriteId (pure reducer)', () => {
  it('adds a new id to the front', () => {
    expect(toggleFavoriteId([2, 1], 3)).toEqual([3, 2, 1]);
  });

  it('removes an existing id', () => {
    expect(toggleFavoriteId([3, 2, 1], 2)).toEqual([3, 1]);
  });

  it('ignores invalid ids without mutating the input', () => {
    const list = [2, 1];
    expect(toggleFavoriteId(list, 0)).toEqual([2, 1]);
    expect(toggleFavoriteId(list, -5)).toEqual([2, 1]);
    expect(toggleFavoriteId(list, 1.5)).toEqual([2, 1]);
    expect(list).toEqual([2, 1]);
  });

  it('caps additions at 50 entries, dropping the oldest', () => {
    let list: number[] = Array.from({ length: 50 }, (_, i) => i + 1);
    list = toggleFavoriteId(list, 999);
    expect(list).toHaveLength(50);
    expect(list[0]).toBe(999);
    expect(list).not.toContain(50);
  });
});

describe('storage-backed actions', () => {
  it('persist a valid id to the namespaced key', () => {
    addFavoriteId(42);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([42]);
  });

  it('remove an id and clear empties the key', () => {
    addFavoriteId(42);
    removeFavoriteId(42);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('clearFavoriteIds removes the key', () => {
    window.localStorage.setItem(KEY, JSON.stringify([5, 6]));
    clearFavoriteIds();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('degrade gracefully when storage writes are blocked', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    expect(() => addFavoriteId(42)).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();

    setItemSpy.mockRestore();
    window.localStorage.setItem(KEY, JSON.stringify([1, 2]));
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    expect(parseFavoriteIds(null)).toEqual([]);
    expect(() => addFavoriteId(3)).not.toThrow();

    getItemSpy.mockRestore();
  });

  it('retains updates in memory after a blocked write', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('blocked'); });

    addFavoriteId(42);
    setItemSpy.mockRestore();
    addFavoriteId(7);

    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([7, 42]);
  });
});
