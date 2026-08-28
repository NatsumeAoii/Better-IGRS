import { Check, Download, Link2, Search, User } from 'lucide-react';
import { Fragment, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, useMemo } from 'react';
import { ActiveFilterSummary, SearchSortControl, type ActiveFilter } from '@/features/search/search-controls';
import { SearchHistory } from '@/features/search/search-history';
import { copyTextToClipboard } from '@/shared/lib/clipboard';
import type { SearchSort } from '@/shared/types';
import pageStyles from './search-page.module.css';

/** Grace period allowing pointer/touch clicks inside open dropdowns to land
 *  before focus-loss state updates hide them (established codebase pattern). */
const BLUR_HIDE_DELAY_MS = 150;

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
  /** Recent queries for the history dropdown (plan 1.4). */
  historyQueries: string[];
  /** Records a submitted (Enter/blur) query into the history store. */
  onCommitQuery: (query: string) => void;
  /** Selects a query from the history dropdown. */
  onSelectHistoryQuery: (query: string) => void;
  /** Removes one query from the history store. */
  onRemoveHistoryQuery: (query: string) => void;
  /** Clears the whole history store. */
  onClearHistory: () => void;
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
  historyQueries,
  onCommitQuery,
  onSelectHistoryQuery,
  onRemoveHistoryQuery,
  onClearHistory,
}: SearchHeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [pubFocused, setPubFocused] = useState(false);
  const [searchCopied, setSearchCopied] = useState(false);
  const [searchCopyFailed, setSearchCopyFailed] = useState(false);
  const [historyDismissed, setHistoryDismissed] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBlurTimerRef = useRef<number | null>(null);
  const lastCommittedQueryRef = useRef('');
  const listboxId = useId();

  const showHistory = searchFocused && query.trim() === '' && !historyDismissed;

  const commitQuery = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === lastCommittedQueryRef.current) return;
    lastCommittedQueryRef.current = trimmed;
    onCommitQuery(trimmed);
  }, [onCommitQuery]);

  const cancelSearchBlurTimer = useCallback(() => {
    if (searchBlurTimerRef.current !== null) {
      window.clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
  }, []);

  const handleSearchFocus = useCallback(() => {
    cancelSearchBlurTimer();
    setSearchFocused(true);
  }, [cancelSearchBlurTimer]);

  const handleSearchBlur = useCallback(() => {
    // Delay hiding so clicks inside the history dropdown (touch input does
    // not always honor mousedown preventDefault) can still select an entry.
    cancelSearchBlurTimer();
    searchBlurTimerRef.current = window.setTimeout(() => {
      searchBlurTimerRef.current = null;
      setSearchFocused(false);
      setHistoryDismissed(false);
      if (searchInputRef.current) commitQuery(searchInputRef.current.value);
    }, BLUR_HIDE_DELAY_MS);
  }, [cancelSearchBlurTimer, commitQuery]);

  const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && showHistory) {
      // Escape with the history dropdown open only dismisses the dropdown;
      // clearing all filters stays the behavior for a populated input.
      event.preventDefault();
      setHistoryDismissed(true);
      return;
    }
    if (event.key === 'Escape') {
      onClearAll();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter') {
      commitQuery(event.currentTarget.value);
    }
  }, [showHistory, onClearAll, commitQuery]);

  const handleHistoryDismiss = useCallback(() => {
    setHistoryDismissed(true);
    searchInputRef.current?.focus();
  }, []);

  const copySearchLink = useCallback(async () => {
    if (await copyTextToClipboard(window.location.href)) {
      setSearchCopyFailed(false);
      setSearchCopied(true);
      setTimeout(() => setSearchCopied(false), 2000);
    } else {
      setSearchCopyFailed(true);
    }
  }, []);

  // ── Publisher autocomplete (ARIA combobox pattern) ────────────────────────
  const pubSuggestions = useMemo(() => {
    if (!publisher || publisher.length < 1 || !publishers) return [];
    const lower = publisher.toLowerCase();
    return publishers.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 5);
  }, [publisher, publishers]);

  const suggestionsOpen = pubFocused && pubSuggestions.length > 0;

  const selectPublisher = useCallback((name: string) => {
    onPublisherChange(name);
    setPubFocused(false);
    setActiveSuggestion(-1);
  }, [onPublisherChange]);

  const handlePublisherKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestionsOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestion(prev => Math.min(prev + 1, pubSuggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestion(prev => Math.max(prev - 1, -1));
        return;
      }
      if (event.key === 'Enter' && activeSuggestion >= 0) {
        event.preventDefault();
        const selected = pubSuggestions[activeSuggestion];
        if (selected) selectPublisher(selected.name);
        return;
      }
      if (event.key === 'Escape') {
        // Escape closes the suggestion list first; a second Escape clears.
        event.preventDefault();
        setPubFocused(false);
        setActiveSuggestion(-1);
        return;
      }
    }
    if (event.key === 'Escape') {
      onClearAll();
      event.currentTarget.blur();
    }
  }, [suggestionsOpen, pubSuggestions, activeSuggestion, selectPublisher, onClearAll]);

  // Reset the active descendant whenever the option list changes.
  useEffect(() => {
    setActiveSuggestion(-1);
  }, [pubSuggestions]);

  const handleOptionMouseDown = useCallback((event: MouseEvent<HTMLLIElement>) => {
    // Keep focus on the combobox input so keyboard continuity is preserved.
    event.preventDefault();
  }, []);

  const publisherOptionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <section className={pageStyles.searchSection}>
      <div className={pageStyles.searchRow}>
        <div className={pageStyles.searchBar}>
          <Search className={pageStyles.searchBarIcon} aria-hidden="true" />
          <input
            id="search-input"
            ref={searchInputRef}
            className={pageStyles.searchBarInput}
            type="text"
            value={query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            autoComplete="off"
            onChange={event => onQueryChange(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
          />
          {!searchFocused && (
            <kbd className={pageStyles.searchShortcutHint} aria-hidden="true">
              {t('search.hintFocus').split('/').map((part, i, arr) => i < arr.length - 1 ? <Fragment key={i}>{part}<span className={pageStyles.searchShortcutKey}>/</span></Fragment> : part)}
            </kbd>
          )}
          <SearchHistory
            isVisible={showHistory}
            queries={historyQueries}
            onSelectQuery={onSelectHistoryQuery}
            onRemoveQuery={onRemoveHistoryQuery}
            onClearAll={onClearHistory}
            onDismiss={handleHistoryDismiss}
            t={t}
          />
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
            role="combobox"
            aria-expanded={suggestionsOpen}
            aria-controls={suggestionsOpen ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeSuggestion >= 0 ? publisherOptionId(activeSuggestion) : undefined}
            onChange={event => onPublisherChange(event.currentTarget.value)}
            onKeyDown={handlePublisherKeyDown}
            onFocus={() => setPubFocused(true)}
            onBlur={() => setTimeout(() => setPubFocused(false), BLUR_HIDE_DELAY_MS)}
          />
          {suggestionsOpen && (
            <ul id={listboxId} className={pageStyles.autocompleteList} role="listbox" aria-label={t('search.publisherLabel')}>
              {pubSuggestions.map((p, index) => (
                <li
                  key={p.name}
                  id={publisherOptionId(index)}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion
                    ? `${pageStyles.autocompleteItem} ${pageStyles.autocompleteItemActive}`
                    : pageStyles.autocompleteItem}
                  onMouseDown={handleOptionMouseDown}
                  onClick={() => selectPublisher(p.name)}
                  onMouseEnter={() => setActiveSuggestion(index)}
                >
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
      {searchCopyFailed && <span className={pageStyles.copySearchError} role="status">{t('search.copyFailed')}</span>}
      <ActiveFilterSummary filters={activeFilters} onClearAll={onClearAll} t={t} />
    </section>
  );
}
