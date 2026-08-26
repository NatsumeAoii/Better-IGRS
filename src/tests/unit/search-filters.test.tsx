import { act, cleanup, render, renderHook, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useSearchFilters } from '@/features/search/use-search-filters';
import { FilterSidebar } from '@/features/search/search-filters';
import type { IgrsMeta, SearchIndex } from '@/shared/types';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useSearchFilters', () => {
  it('initial state has empty query, empty publisher, empty sets, page 1, sort relevance', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    expect(result.current.state.query).toBe('');
    expect(result.current.state.publisher).toBe('');
    expect(result.current.state.ratings.size).toBe(0);
    expect(result.current.state.platforms.size).toBe(0);
    expect(result.current.state.descriptors.size).toBe(0);
    expect(result.current.state.years.size).toBe(0);
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.sort).toBe('relevance');
  });

  it('setQuery updates the query value', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    act(() => {
      result.current.actions.setQuery('test game');
    });

    expect(result.current.state.query).toBe('test game');
  });

  it('set filter adds a value, clearing removes it (toggle pattern)', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    act(() => {
      result.current.actions.setRatings(new Set([5]));
    });
    expect(result.current.state.ratings.has(5)).toBe(true);
    expect(result.current.state.ratings.size).toBe(1);

    act(() => {
      result.current.actions.setRatings(new Set());
    });
    expect(result.current.state.ratings.has(5)).toBe(false);
    expect(result.current.state.ratings.size).toBe(0);
  });

  it('removeFilter removes a specific filter value', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    act(() => {
      result.current.actions.setRatings(new Set([4, 5, 6]));
    });
    expect(result.current.state.ratings.size).toBe(3);

    act(() => {
      result.current.actions.removeFilter('rating', 5);
    });
    expect(result.current.state.ratings.has(5)).toBe(false);
    expect(result.current.state.ratings.has(4)).toBe(true);
    expect(result.current.state.ratings.has(6)).toBe(true);
    expect(result.current.state.page).toBe(1);
  });

  it('removeFilter works for platforms, descriptors, and years', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    act(() => {
      result.current.actions.setPlatforms(new Set([1, 2]));
      result.current.actions.setDescriptors(new Set([10, 20]));
      result.current.actions.setYears(new Set(['2023', '2024']));
    });

    act(() => {
      result.current.actions.removeFilter('platform', 1);
    });
    expect(result.current.state.platforms.has(1)).toBe(false);
    expect(result.current.state.platforms.has(2)).toBe(true);

    act(() => {
      result.current.actions.removeFilter('descriptor', 20);
    });
    expect(result.current.state.descriptors.has(20)).toBe(false);
    expect(result.current.state.descriptors.has(10)).toBe(true);

    act(() => {
      result.current.actions.removeFilter('year', '2023');
    });
    expect(result.current.state.years.has('2023')).toBe(false);
    expect(result.current.state.years.has('2024')).toBe(true);
  });

  it('clearAll resets everything', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    act(() => {
      result.current.actions.setQuery('something');
      result.current.actions.setPublisher('publisher');
      result.current.actions.setRatings(new Set([4]));
      result.current.actions.setPlatforms(new Set([1]));
      result.current.actions.setDescriptors(new Set([10]));
      result.current.actions.setYears(new Set(['2024']));
    });

    act(() => {
      result.current.actions.clearAll();
    });

    expect(result.current.state.query).toBe('');
    expect(result.current.state.publisher).toBe('');
    expect(result.current.state.ratings.size).toBe(0);
    expect(result.current.state.platforms.size).toBe(0);
    expect(result.current.state.descriptors.size).toBe(0);
    expect(result.current.state.years.size).toBe(0);
    expect(result.current.state.page).toBe(1);
  });

  it('filterVersion increments on filter changes', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    const initialVersion = result.current.filterVersion;

    act(() => {
      result.current.actions.setRatings(new Set([5]));
    });

    expect(result.current.filterVersion).toBeGreaterThan(initialVersion);
  });

  it('hasActiveFilters reflects filter state', () => {
    const { result } = renderHook(() => useSearchFilters(), { wrapper });

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.actions.setQuery('test');
    });
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.actions.setQuery('');
    });
    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.actions.setPlatforms(new Set([1]));
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });
});

describe('FilterSidebar publisher directory', () => {
  afterEach(cleanup);

  const translations: Record<string, string> = {
    'sidebar.showAllPublishers': 'Show all {count} publishers',
    'sidebar.showTopPublishers': 'Show top publishers only',
    'sidebar.publisherSearchLabel': 'Filter publishers...',
    'sidebar.noPublishersFound': 'No publishers match "{query}".',
  };
  const t = (key: string) => translations[key] ?? key;

  function makeIndex(): SearchIndex {
    return {
      items: [{
        game: { id: 1, name: 'Game One', publisherName: 'Pub A', releaseYear: 2024 },
        nameNorm: 'game one',
        publisherNorm: 'pub a',
        descNorm: '',
        ratingIds: [7],
        descriptorIds: [],
        platformIds: [1],
        ratingIdSet: new Set([7]),
        descriptorIdSet: new Set(),
        platformIdSet: new Set([1]),
        year: '2024',
      }],
      facets: {
        ratingCounts: { '7': 1 },
        platformCounts: { '1': 1 },
        descriptorCounts: {},
        yearCounts: { '2024': 1 },
      },
    };
  }

  const meta = { ratings: { '7': { name: 'SU' } }, descriptors: {}, platforms: { '1': { nameEn: 'PC' } } } as unknown as IgrsMeta;

  function makePublishers(count: number) {
    return Array.from({ length: count }, (_, i) => ({ name: `Publisher ${String(i + 1).padStart(2, '0')} ${i === count - 1 ? 'Acme Studio' : 'Games'}`, count: count - i }));
  }

  function renderSidebar(publishers: Array<{ name: string; count: number }>) {
    return render(
      <FilterSidebar
        clearAll={() => undefined}
        descriptors={new Set()}
        lang="en"
        meta={meta}
        platforms={new Set()}
        publishers={publishers}
        ratings={new Set()}
        searchIndex={makeIndex()}
        setDescriptors={() => undefined}
        setPlatforms={() => undefined}
        setPublisher={() => undefined}
        setRatings={() => undefined}
        setYears={() => undefined}
        t={t}
        years={new Set()}
      />
    );
  }

  it('renders only the top publishers until the directory is expanded', () => {
    renderSidebar(makePublishers(25));

    const panel = document.getElementById('filter-publisher-directory') as HTMLElement;
    expect(panel).not.toBeNull();
    const scoped = within(panel);

    expect(scoped.getByRole('button', { name: /Publisher 01/ })).toBeInTheDocument();
    expect(scoped.queryByRole('button', { name: /Publisher 21/ })).not.toBeInTheDocument();
    expect(scoped.getByRole('button', { name: 'Show all 25 publishers' })).toBeInTheDocument();

    fireEvent.click(scoped.getByRole('button', { name: 'Show all 25 publishers' }));

    // Expanded: full directory replaces the top list; virtualization keeps only
    // the visible window in the DOM, so assert state rather than row counts.
    expect(scoped.getByRole('button', { name: 'Show top publishers only' })).toHaveAttribute('aria-expanded', 'true');
    expect(scoped.getByRole('searchbox')).toBeInTheDocument();
  });

  it('filters the expanded directory case-insensitively and reports empty state', () => {
    renderSidebar(makePublishers(30));

    const panel = document.getElementById('filter-publisher-directory') as HTMLElement;
    const scoped = within(panel);
    fireEvent.click(scoped.getByRole('button', { name: 'Show all 30 publishers' }));

    fireEvent.change(scoped.getByRole('searchbox'), { target: { value: 'ACME' } });

    expect(scoped.getByRole('button', { name: /Acme Studio/ })).toBeInTheDocument();
    expect(scoped.queryByRole('button', { name: /Publisher 05 Games/ })).not.toBeInTheDocument();

    fireEvent.change(scoped.getByRole('searchbox'), { target: { value: 'zzzz-no-match' } });

    expect(scoped.getByRole('status')).toHaveTextContent('No publishers match "zzzz-no-match".');
  });

  it('collapses back to the top-publisher list', () => {
    renderSidebar(makePublishers(25));

    const panel = document.getElementById('filter-publisher-directory') as HTMLElement;
    const scoped = within(panel);
    const toggle = scoped.getByRole('button', { name: 'Show all 25 publishers' });

    fireEvent.click(toggle);
    expect(scoped.getByRole('searchbox')).toBeInTheDocument();

    fireEvent.click(scoped.getByRole('button', { name: 'Show top publishers only' }));
    expect(scoped.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(scoped.queryByRole('button', { name: /Publisher 21/ })).not.toBeInTheDocument();
  });
});
