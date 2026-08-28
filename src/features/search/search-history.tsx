/**
 * Recent-searches dropdown for the search page.
 *
 * Displayed only while the search input is empty and focused (plan 1.4).
 * Each entry is a plain select button plus a separate labeled remove button —
 * interactive elements are never nested, per the accessibility rules.
 *
 * The container swallows `mousedown` so clicking an entry does not blur the
 * search input before the click lands (the same blur-ordering pitfall the
 * publisher autocomplete already guards against).
 */
import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { Clock, X } from 'lucide-react';

export interface SearchHistoryProps {
  /** Whether the dropdown is visible (input focused and empty). */
  isVisible: boolean;
  /** Recent queries, most recent first. */
  queries: string[];
  /** Selects a query as the active search. */
  onSelectQuery: (query: string) => void;
  /** Removes one query from history. */
  onRemoveQuery: (query: string) => void;
  /** Clears the whole history. */
  onClearAll: () => void;
  /** Dismisses the dropdown without changing the search (Escape). */
  onDismiss: () => void;
  /** Translator from the language provider. */
  t: (key: string) => string;
}

interface SearchHistoryItemProps {
  query: string;
  removeLabel: string;
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
}

const SearchHistoryItem = memo(function SearchHistoryItem({
  query,
  removeLabel,
  onSelect,
  onRemove,
}: SearchHistoryItemProps) {
  const handleRemove = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // Keep the dropdown open after removing one entry (focus stays put).
    event.stopPropagation();
    onRemove(query);
  }, [query, onRemove]);

  return (
    <li className="search-history-entry">
      <button
        type="button"
        className="search-history-item"
        onClick={() => onSelect(query)}
      >
        <Clock className="search-history-icon" size={14} aria-hidden="true" />
        <span className="search-history-text">{query}</span>
      </button>
      <button
        type="button"
        className="search-history-remove"
        onClick={handleRemove}
        aria-label={removeLabel}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  );
});

export function SearchHistory({
  isVisible,
  queries,
  onSelectQuery,
  onRemoveQuery,
  onClearAll,
  onDismiss,
  t,
}: SearchHistoryProps) {
  // Clicking anywhere in the panel must not blur the search input — the
  // dropdown's visibility is tied to input focus, so a blur here would hide
  // the panel before the click could select an entry.
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  // Escape from within the panel dismisses it and returns focus to the input.
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
    }
  }, [onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className="search-history"
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div className="search-history-header">
        <span id="search-history-label">{t('search.history.title')}</span>
        {queries.length > 0 && (
          <button
            type="button"
            className="search-history-clear"
            onClick={onClearAll}
          >
            {t('search.history.clear')}
          </button>
        )}
      </div>
      {queries.length === 0 ? (
        <p className="search-history-empty">{t('search.history.empty')}</p>
      ) : (
        <ul className="search-history-list" aria-labelledby="search-history-label">
          {queries.map(query => (
            <SearchHistoryItem
              key={query}
              query={query}
              removeLabel={t('search.history.remove').replace('{query}', query)}
              onSelect={onSelectQuery}
              onRemove={onRemoveQuery}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

