import { Check, Download, Link2, Search, User } from 'lucide-react';
import { Fragment, useCallback, type KeyboardEvent, useMemo, useState } from 'react';
import { ActiveFilterSummary, SearchSortControl, type ActiveFilter } from '@/features/search/search-controls';
import type { SearchSort } from '@/shared/types';
import pageStyles from './search-page.module.css';

export interface SearchHeaderProps {
  query: string;
  publisher: string;
  onQueryChange: (value: string) => void;
  onPublisherChange: (value: string) => void;
  statsText: string;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
  activeFilters: ActiveFilter[];
  onClearAll: () => void;
  t: (key: string) => string;
  publishers?: Array<{ name: string; count: number }>;
  onExportCSV?: () => void;
}

function handleInputKey(event: KeyboardEvent<HTMLInputElement>, clearAll: () => void): void {
  if (event.key === 'Escape') {
    clearAll();
    event.currentTarget.blur();
  }
}

export function SearchHeader({
  query,
  publisher,
  onQueryChange,
  onPublisherChange,
  statsText,
  sort,
  onSortChange,
  activeFilters,
  onClearAll,
  t,
  publishers,
  onExportCSV,
}: SearchHeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [pubFocused, setPubFocused] = useState(false);
  const [searchCopied, setSearchCopied] = useState(false);
  const copySearchLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSearchCopied(true);
      setTimeout(() => setSearchCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }, []);
  const pubSuggestions = useMemo(() => {
    if (!publisher || publisher.length < 1 || !publishers) return [];
    const lower = publisher.toLowerCase();
    return publishers.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 5);
  }, [publisher, publishers]);

  return (
    <section className={pageStyles.searchSection}>
      <div className={pageStyles.searchRow}>
        <div className={pageStyles.searchBar}>
          <Search className={pageStyles.searchBarIcon} aria-hidden="true" />
          <input
            id="search-input"
            className={pageStyles.searchBarInput}
            type="text"
            value={query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            autoComplete="off"
            onChange={event => onQueryChange(event.currentTarget.value)}
            onKeyDown={event => handleInputKey(event, onClearAll)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {!searchFocused && (
            <kbd className={pageStyles.searchShortcutHint} aria-hidden="true">
              {t('search.hintFocus').split('/').map((part, i, arr) => i < arr.length - 1 ? <Fragment key={i}>{part}<span className={pageStyles.searchShortcutKey}>/</span></Fragment> : part)}
            </kbd>
          )}
        </div>
        <div className={`${pageStyles.searchBar} ${pageStyles.publisherBar}`}>
          <User className={pageStyles.searchBarIcon} aria-hidden="true" />
          <input
            className={pageStyles.searchBarInput}
            type="text"
            value={publisher}
            placeholder={t('search.publisher')}
            aria-label={t('search.publisher')}
            autoComplete="off"
            onChange={event => onPublisherChange(event.currentTarget.value)}
            onKeyDown={event => handleInputKey(event, onClearAll)}
            onFocus={() => setPubFocused(true)}
            onBlur={() => setTimeout(() => setPubFocused(false), 150)}
          />
          {pubSuggestions.length > 0 && pubFocused && (
            <ul className={pageStyles.autocompleteList} role="listbox">
              {pubSuggestions.map(p => (
                <li key={p.name} role="option" className={pageStyles.autocompleteItem}
                    onMouseDown={() => { onPublisherChange(p.name); setPubFocused(false); }}>
                  <span>{p.name}</span>
                  <span className={pageStyles.autocompleteCount}>{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className={pageStyles.searchStats}>
        {statsText}
        {onExportCSV && (
          <button type="button" className={pageStyles.exportBtn} onClick={onExportCSV}>
            <Download size={14} /> CSV
          </button>
        )}
      </div>
      <SearchSortControl
        sort={sort}
        setSort={onSortChange}
        t={t}
      />
      <button type="button" className={pageStyles.copySearchLink} onClick={() => void copySearchLink()}>
        {searchCopied ? (
          <>
            <Check size={14} className={pageStyles.copyIcon} aria-hidden="true" />
            <span>{t('search.copied')}</span>
          </>
        ) : (
          <>
            <Link2 size={14} className={pageStyles.copyIcon} aria-hidden="true" />
            <span>{t('search.copyLink')}</span>
          </>
        )}
      </button>
      <ActiveFilterSummary filters={activeFilters} onClearAll={onClearAll} t={t} />
    </section>
  );
}
