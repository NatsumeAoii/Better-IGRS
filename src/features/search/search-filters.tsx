import { type ReactNode, useState, useCallback, useId, useRef, useSyncExternalStore, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { filterIndexedGames, fuzzyScorePreNormalized, type FilterOptions } from '@/core/search-index';
import { normalizeSearchText } from '@/core/search-text';
import { toggleSet } from '@/shared/lib/collections';
import { descriptorName, ratingName, ratingWeight } from '@/shared/lib/ratings';
import { platformName } from '@/shared/lib/platforms';
import type { IgrsMeta, SearchIndex } from '@/shared/types';
import styles from './search-filters.module.css';

const MOBILE_BREAKPOINT = '(max-width: 767px)';

function getMatchMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(MOBILE_BREAKPOINT);
}

function subscribeMobileQuery(callback: () => void) {
  const mql = getMatchMedia();
  if (!mql) return () => {};
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getIsMobile() {
  return getMatchMedia()?.matches ?? false;
}

function getIsMobileServer() {
  return false;
}

/** Returns true when viewport is below 768px */
function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobileQuery, getIsMobile, getIsMobileServer);
}

interface FilterSidebarProps {
  clearAll: () => void;
  descriptors: Set<number>;
  lang: 'en' | 'id';
  meta: IgrsMeta;
  platforms: Set<number>;
  publisher?: string;
  query?: string;
  ratings: Set<number>;
  searchIndex: SearchIndex;
  setDescriptors: (next: Set<number>) => void;
  setPlatforms: (next: Set<number>) => void;
  setRatings: (next: Set<number>) => void;
  setYears: (next: Set<string>) => void;
  setPublisher: (name: string) => void;
  t: (key: string) => string;
  years: Set<string>;
  /** Top publishers by game count (#10) */
  publishers?: Array<{ name: string; count: number }>;
}

export function FilterSidebar(props: FilterSidebarProps) {
  const {
    clearAll,
    descriptors,
    lang,
    meta,
    platforms,
    publisher,
    query,
    ratings,
    searchIndex,
    setDescriptors,
    setPlatforms,
    setRatings,
    setYears,
    setPublisher,
    t,
    years,
    publishers
  } = props;
  const makeToggle = useCallback((setter: (next: Set<number>) => void, current: Set<number>, value: number) => {
    return () => setter(toggleSet(current, value));
  }, []);

  const hasFilters = ratings.size || platforms.size || descriptors.size || years.size;
  const isMobile = useIsMobile();
  const noDescriptorsTotal = useMemo(() => searchIndex.items.filter(i => i.descriptorIds.length === 0).length, [searchIndex]);

  const dynamicFacets = useMemo(() => {
    const computeCounts = (excludeFacet: 'rating' | 'platform' | 'descriptor' | 'year') => {
      const baseFilters: FilterOptions = {};
      if (excludeFacet !== 'rating') baseFilters.ratings = ratings;
      if (excludeFacet !== 'platform') baseFilters.platforms = platforms;
      if (excludeFacet !== 'descriptor') baseFilters.descriptors = descriptors;
      if (excludeFacet !== 'year') baseFilters.years = years;
      if (query) baseFilters.query = query;
      if (publisher) baseFilters.publisher = publisher;

      const results = filterIndexedGames(searchIndex.items, baseFilters, fuzzyScorePreNormalized);
      const counts: Record<string, number> = {};
      let noDescriptor = 0;
      for (const { item } of results) {
        if (item.descriptorIds.length === 0) noDescriptor += 1;
        if (excludeFacet === 'rating') { for (const id of item.ratingIds) counts[id] = (counts[id] || 0) + 1; }
        else if (excludeFacet === 'platform') { for (const id of item.platformIds) counts[id] = (counts[id] || 0) + 1; }
        else if (excludeFacet === 'descriptor') { for (const id of item.descriptorIds) counts[id] = (counts[id] || 0) + 1; }
        else if (excludeFacet === 'year') { if (item.year) counts[item.year] = (counts[item.year] || 0) + 1; }
      }
      return { counts, noDescriptor };
    };

    const hasAnyFilter = ratings.size || platforms.size || descriptors.size || years.size || query || publisher;
    if (!hasAnyFilter) {
      return { ...searchIndex.facets, noDescriptorCount: noDescriptorsTotal };
    }

    const ratingCounts = computeCounts('rating');
    const platformCounts = computeCounts('platform');
    const descriptorCounts = computeCounts('descriptor');
    const yearCounts = computeCounts('year');

    return {
      ratingCounts: ratingCounts.counts,
      platformCounts: platformCounts.counts,
      descriptorCounts: descriptorCounts.counts,
      yearCounts: yearCounts.counts,
      noDescriptorCount: descriptorCounts.noDescriptor,
    };
  }, [searchIndex, ratings, platforms, descriptors, years, query, publisher, noDescriptorsTotal]);

  return (
    <>
      <FilterPanel id="filter-rating" title={t('sidebar.rating')} activeCount={ratings.size} isMobile={isMobile}>
        {Object.entries(dynamicFacets.ratingCounts)
          .map(([id, count]) => ({ count, id: Number(id) }))
          .sort((a, b) => ratingWeight(meta, a.id) - ratingWeight(meta, b.id))
          .map(({ count, id }) => (
            <FilterCheckbox
              checked={ratings.has(id)}
              count={count}
              key={id}
              label={ratingName(meta, id)}
              onChange={makeToggle(setRatings, ratings, id)}
            />
          ))}
      </FilterPanel>
      <FilterPanel id="filter-platform" title={t('sidebar.platform')} activeCount={platforms.size} isMobile={isMobile}>
        {Object.entries(dynamicFacets.platformCounts)
          .map(([id, count]) => ({ count, id: Number(id) }))
          .sort((a, b) => platformName(meta, a.id, lang).localeCompare(platformName(meta, b.id, lang)))
          .map(({ count, id }) => (
            <FilterCheckbox
              checked={platforms.has(id)}
              count={count}
              key={id}
              label={platformName(meta, id, lang)}
              onChange={makeToggle(setPlatforms, platforms, id)}
            />
          ))}
      </FilterPanel>
      <FilterPanel id="filter-descriptor" title={t('sidebar.descriptor')} activeCount={descriptors.size} isMobile={isMobile}>
        <FilterCheckbox
          checked={descriptors.has(-1)}
          count={dynamicFacets.noDescriptorCount}
          label={t('search.noDescriptors')}
          onChange={() => {
            const next = new Set(descriptors);
            if (next.has(-1)) next.delete(-1); else next.add(-1);
            setDescriptors(next);
          }}
        />
        {Object.entries(dynamicFacets.descriptorCounts)
          .map(([id, count]) => ({ count, id: Number(id) }))
          .sort((a, b) => descriptorName(meta, a.id, lang).localeCompare(descriptorName(meta, b.id, lang)))
          .map(({ count, id }) => (
            <FilterCheckbox
              checked={descriptors.has(id)}
              count={count}
              key={id}
              label={descriptorName(meta, id, lang)}
              onChange={makeToggle(setDescriptors, descriptors, id)}
            />
          ))}
      </FilterPanel>
      <FilterPanel id="filter-year" title={t('filter.year')} activeCount={years.size} isMobile={isMobile}>
        <YearRangeSelect years={years} yearCounts={dynamicFacets.yearCounts} setYears={setYears} t={t} />
      </FilterPanel>
      
      {/* Publisher directory (#6.3): top publishers inline, full filterable list on demand */}
      {publishers && publishers.length > 0 && (
        <FilterPanel id="filter-publisher-directory" title={t('sidebar.topPublishers')} activeCount={0} isMobile={isMobile}>
          <PublisherDirectory
            publisher={publisher}
            publishers={publishers}
            setPublisher={setPublisher}
            t={t}
          />
        </FilterPanel>
      )}
      <button className={`${styles.clearBtn}${hasFilters ? '' : ` ${styles.clearBtnHidden}`}`} type="button" onClick={() => clearAll()}>
        {t('filter.clear')}
      </button>
    </>
  );
}

const TOP_PUBLISHERS_COUNT = 20;
const PUBLISHER_DIRECTORY_ROW_HEIGHT = 30;
const PUBLISHER_DIRECTORY_HEIGHT = 240;
// The directory viewport height is capped by CSS (publisherDirectoryScroll),
// so a constant rect is exact — and keeps rendering deterministic in tests.
function observeDirectoryRect(
  _instance: unknown,
  cb: (rect: { width: number; height: number }) => void
): () => void {
  cb({ width: 280, height: PUBLISHER_DIRECTORY_HEIGHT });
  return () => undefined;
}

interface PublisherEntry {
  name: string;
  count: number;
}

function PublisherDirectory({ publisher, publishers, setPublisher, t }: {
  publisher?: string;
  publishers: PublisherEntry[];
  setPublisher: (name: string) => void;
  t: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState('');
  const inputId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  const query = normalizeSearchText(filterText);
  const filtered = useMemo(() => (
    expanded && query
      ? publishers.filter(entry => normalizeSearchText(entry.name).includes(query))
      : publishers
  ), [expanded, publishers, query]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is intentionally used for large list virtualization.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PUBLISHER_DIRECTORY_ROW_HEIGHT,
    overscan: 6,
    observeElementRect: observeDirectoryRect,
  });

  const toggleDirectory = useCallback(() => {
    setExpanded(prev => !prev);
    setFilterText('');
  }, []);

  return (
    <>
      {!expanded && publishers.slice(0, TOP_PUBLISHERS_COUNT).map(({ name, count }) => (
        <PublisherButton key={name} active={publisher === name} count={count} name={name} onSelect={setPublisher} />
      ))}

      <button
        type="button"
        className={styles.publisherDirectoryToggle}
        aria-expanded={expanded}
        onClick={toggleDirectory}
      >
        <ChevronDown className={`${styles.chevron}${expanded ? ` ${styles.chevronOpen}` : ''}`} aria-hidden="true" />
        <span>
          {(expanded ? t('sidebar.showTopPublishers') : t('sidebar.showAllPublishers'))
            .replace('{count}', String(publishers.length))}
        </span>
      </button>

      {expanded && (
        <>
          <input
            id={inputId}
            type="search"
            className={styles.publisherSearchInput}
            placeholder={t('sidebar.publisherSearchLabel')}
            aria-label={t('sidebar.publisherSearchLabel')}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className={styles.publisherDirectoryEmpty} role="status">
              {t('sidebar.noPublishersFound').replace('{query}', filterText.trim())}
            </p>
          ) : (
            <div ref={scrollRef} className={styles.publisherDirectoryScroll} tabIndex={-1}>
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                {virtualizer.getVirtualItems().map(virtualItem => {
                  const entry = filtered[virtualItem.index];
                  if (!entry) return null;
                  return (
                    <div
                      key={entry.name}
                      style={{
                        left: 0,
                        position: 'absolute',
                        top: 0,
                        transform: `translateY(${virtualItem.start}px)`,
                        width: '100%',
                      }}
                    >
                      <PublisherButton active={publisher === entry.name} count={entry.count} name={entry.name} onSelect={setPublisher} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function PublisherButton({ active, count, name, onSelect }: {
  active: boolean;
  count: number;
  name: string;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.filterPublisherLink}${active ? ` ${styles.filterPublisherLinkActive}` : ''}`}
      onClick={() => onSelect(name)}
      aria-current={active ? 'true' : undefined}
    >
      <span className={styles.filterPublisherName}>{name}</span>
      <span className={styles.filterPublisherCount}>{count}</span>
    </button>
  );
}

interface FilterPanelProps {
  children: ReactNode;
  id: string;
  title: string;
  activeCount: number;
  isMobile: boolean;
}

function FilterPanel({ children, id, title, activeCount, isMobile }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(!isMobile);
  const contentId = `${id}-content`;

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // On desktop, always show content (no accordion behavior)
  const expanded = isMobile ? isOpen : true;

  return (
    <section className={styles.filterPanel} id={id}>
      <button
        type="button"
        className={styles.filterPanelHeader}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={isMobile ? handleToggle : undefined}
      >
        <span>{title}</span>
        {isMobile && activeCount > 0 && (
          <span className={styles.activeCount}>{activeCount}</span>
        )}
        {isMobile && (
          <ChevronDown
            className={`${styles.chevron}${expanded ? ` ${styles.chevronOpen}` : ''}`}
            aria-hidden="true"
          />
        )}
      </button>
      <div
        id={contentId}
        className={`${styles.filterPanelBody}${id === 'filter-year' || id === 'filter-platform' ? ` ${styles.filterPanelBodyShort}` : ''}${!expanded ? ` ${styles.filterPanelBodyCollapsed}` : ''}`}
      >
        {children}
      </div>
    </section>
  );
}

function FilterCheckbox({ checked, count, label, onChange }: { checked: boolean; count: number; label: string; onChange: () => void }) {
  const countId = useId();
  // Zero-count facets stay clickable (escape hatch) but read as unavailable.
  const dimmed = count === 0 && !checked;
  return (
    <label className={`${styles.filterCheckbox} filter-checkbox${dimmed ? ` ${styles.filterCheckboxZero}` : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-describedby={countId}
        aria-disabled={dimmed ? 'true' : undefined}
      />
      <span>{label}</span>
      <span id={countId} className={styles.filterCount}>{count}</span>
    </label>
  );
}

function YearRangeSelect({ years, yearCounts, setYears, t }: { years: Set<string>; yearCounts: Record<string, number>; setYears: (next: Set<string>) => void; t: (key: string) => string }) {
  const yearEntries = Object.entries(yearCounts).sort((a, b) => Number(b[0]) - Number(a[0]));
  const yearValues = yearEntries.map(([y]) => y);

  const selectedYears = [...years].sort();
  const rangeFrom = selectedYears[0] || yearValues[yearValues.length - 1] || '';
  const rangeTo = selectedYears[selectedYears.length - 1] || yearValues[0] || '';

  const handleRangeChange = useCallback((from: string, to: string) => {
    const fromNum = Number(from);
    const toNum = Number(to);
    if (!fromNum || !toNum) { setYears(new Set()); return; }
    const min = Math.min(fromNum, toNum);
    const max = Math.max(fromNum, toNum);
    const newYears = new Set(yearValues.filter(y => {
      const yn = Number(y);
      return yn >= min && yn <= max;
    }));
    setYears(newYears);
  }, [yearValues, setYears]);

  if (yearValues.length === 0) return null;

  return (
    <div className={styles.yearRangeRow}>
      <select value={rangeFrom} onChange={e => handleRangeChange(e.target.value, rangeTo)} aria-label={t('filter.yearFrom')}>
        {yearValues.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <span>–</span>
      <select value={rangeTo} onChange={e => handleRangeChange(rangeFrom, e.target.value)} aria-label={t('filter.yearTo')}>
        {yearValues.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
