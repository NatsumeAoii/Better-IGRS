import { memo, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, Gamepad2 } from 'lucide-react';
import { DescriptorIcons } from '@/shared/components/descriptor-icons';
import { highlight } from '@/shared/lib/text';
import { descriptorIdsFromGame, ratingIdsFromGame, ratingName } from '@/shared/lib/ratings';
import { platformIdsFromGame, platformName } from '@/shared/lib/platforms';
import { SearchSuggestions } from '@/features/search/search-suggestions-panel';
import type { Suggestion } from '@/features/search/search-suggestions';
import type { createSteamApi } from '@/shared/api/steam-api';
import type { IgrsGame, IgrsMeta } from '@/shared/types';
import pageStyles from './search-page.module.css';
import cardStyles from './game-card.module.css';

type SteamApi = ReturnType<typeof createSteamApi>;

/** Estimated initial height; actual virtual rows are measured after render. */
const ESTIMATED_CARD_HEIGHT = 132;

/** Fallback gap between cards matching the CSS --card-gap variable. */
const CARD_GAP = 16;

/** Overscan count: items rendered above/below the visible viewport */
const OVERSCAN_COUNT = 5;

interface GameCardProps {
  game: IgrsGame;
  lang: 'en' | 'id';
  meta: IgrsMeta;
  publisherQuery: string;
  query: string;
  t: (key: string) => string;
  /** Optional Steam API facade — enables the quick Steam-check link when a match is already cached (#29) */
  steamApi?: SteamApi;
}

const GameCard = memo(function GameCard({ game, lang, meta, publisherQuery, query, t, steamApi }: GameCardProps) {
  const ratingId = useMemo(() => ratingIdsFromGame(game)[0] || null, [game]);
  const allDescriptorIds = useMemo(() => descriptorIdsFromGame(game), [game]);
  const descriptorIds = useMemo(() => allDescriptorIds.slice(0, 4), [allDescriptorIds]);
  const platformNames = useMemo(() => platformIdsFromGame(meta, game).map(id => platformName(meta, id, lang)).join(', '), [game, meta, lang]);
  // Non-reactive peek: link appears on re-render once a match was resolved this
  // session (e.g., after visiting the game detail). Never triggers a fetch.
  const steamAppId = useMemo(() => {
    const peeked = steamApi?.peekSteamMatch(game);
    return peeked?.status === 'match' ? peeked.match.appId : null;
  }, [game, steamApi]);

  return (
    <article className={`${cardStyles.gameCard} ${pageStyles.fadeIn}`} data-visual-role="game-card">
      <div className={cardStyles.gameCardTop}>
        <div className={cardStyles.gameCardInfo}>
          <div className={cardStyles.gameTitleRow}>
            <Link to={`/game/${game.id}`} className={`${cardStyles.gameTitle} ${cardStyles.gameTitleLink}`}>
              {highlight(game.name, query)}
            </Link>
            {/* Data incomplete indicator (#33): missing descriptors and/or platforms */}
            {(!game.descriptors?.length || !game.platforms?.length) && (
              <span className={cardStyles.dataIncompleteBadge} title={t('card.dataIncomplete')}>
                {t('card.dataIncomplete')}
              </span>
            )}
          </div>
          <div className={cardStyles.gamePublisher}>
            <Link
              to={`/search/?publisher=${encodeURIComponent(game.publisherName)}`}
              className={cardStyles.gamePublisherLink}
            >
              {highlight(game.publisherName, publisherQuery)}
            </Link>
          </div>
          <div className={cardStyles.gameCardMeta}>
            <div className={cardStyles.gameMetaGroup}>
              <span className={cardStyles.gameMetaLabel}>{t('detail.year')}</span>
              <span className={cardStyles.gameMetaValue}>{game.releaseYear}</span>
            </div>
            <div className={cardStyles.gameMetaGroup}>
              <span className={cardStyles.gameMetaLabel}>{t('detail.platforms')}</span>
              <span className={cardStyles.gameMetaValue}>{platformNames || '-'}</span>
            </div>
            <div className={cardStyles.descriptorPreview}>
              <DescriptorIcons ids={descriptorIds} emptyLabel={t('card.noDescriptors')} lang={lang} meta={meta} />
              {allDescriptorIds.length > 4 && (
                <span className={cardStyles.descriptorOverflow}>+{allDescriptorIds.length - 4}</span>
              )}
            </div>
          </div>
        </div>
        <div className={cardStyles.gameCardRight}>
          {ratingId ? <span className={cardStyles.ratingBadge} data-rating={ratingId}>{ratingName(meta, ratingId)}</span> : null}
          {steamAppId ? (
            <Link
              to={`/steamchecker/?appid=${encodeURIComponent(steamAppId)}`}
              className={cardStyles.steamQuickLink}
              aria-label={t('card.steamCheck')}
              title={t('card.steamCheck')}
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span>Steam</span>
            </Link>
          ) : null}
          <Link to={`/game/${game.id}`} className={cardStyles.viewDetail}>
            {t('card.viewDetail')}
          </Link>
        </div>
      </div>
    </article>
  );
});

interface SearchResultsProps {
  /** All filtered results (full set for virtual scrolling, or paginated slice for pagination mode) */
  allResults: Array<{ game: IgrsGame }>;
  /** Paginated slice of results (used when total ≤ threshold) */
  visibleResults: Array<{ game: IgrsGame }>;
  /** Total count of filtered results */
  totalCount: number;
  onOpenDetail?: (id: number) => void;
  /** Whether virtual scrolling is active */
  useVirtualScroll: boolean;
  /** Incremented on filter/query change to trigger scroll reset */
  filterVersion: number;
  lang: 'en' | 'id';
  meta: IgrsMeta;
  publisherQuery: string;
  query: string;
  onClearAll: () => void;
  t: (key: string) => string;
  /** Computed suggestion for zero-results state */
  suggestion?: Suggestion | null;
  /** Callback to remove a specific filter by key and value */
  onRemoveFilter?: (filterKey: string, filterValue: string | number) => void;
  /** Callback to clear the search query */
  onClearQuery?: () => void;
  /** Resolves a filter key+value to a human-readable label */
  filterLabel?: (filterKey: string, filterValue: string | number) => string;
  /** Typo correction suggestion for empty results */
  typoSuggestion?: string | null;
  /** Callback when typo suggestion is clicked */
  onTypoSuggestionClick?: (name: string) => void;
  /** Optional Steam API facade for quick Steam-check links on cards (#29) */
  steamApi?: SteamApi;
}

/**
 * Arrow-key navigation between game cards (#21) — shared by the virtualized
 * and paginated result lists. ArrowDown/ArrowUp move focus between card title
 * links; Enter follows the focused link natively.
 */
function handleCardListKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const container = e.currentTarget;
  // Focus targets are the title links (stretched-link pattern covers whole card)
  const links = container.querySelectorAll<HTMLElement>('[data-visual-role="game-card"] a[class*="gameTitle"]');
  const currentIndex = Array.from(links).findIndex(el => el === document.activeElement || el.contains(document.activeElement));

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = currentIndex + 1;
    if (next < links.length) links[next]?.focus();
  } else {
    e.preventDefault();
    const prev = currentIndex - 1;
    if (prev >= 0) links[prev]?.focus();
  }
  // Enter works natively on <a> elements — no handler needed
}

function VirtualizedResults({
  allResults,
  totalCount,
  filterVersion,
  lang,
  meta,
  publisherQuery,
  query,
  t,
  steamApi,
}: Pick<SearchResultsProps, 'allResults' | 'totalCount' | 'filterVersion' | 'lang' | 'meta' | 'publisherQuery' | 'query' | 't' | 'steamApi'>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is intentionally used for large result virtualization.
  const virtualizer = useVirtualizer({
    count: allResults.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT + CARD_GAP,
    measureElement: element => element.getBoundingClientRect().height,
    overscan: OVERSCAN_COUNT,
  });

  // Reset scroll to top when filters/query change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [filterVersion]);

  return (
    <section id="game-list" className={cardStyles.gameList}>
      <div className={cardStyles.virtualResultCount}>
        {t('search.showingResults').replace('{count}', String(totalCount))}
      </div>
      <div
        ref={scrollContainerRef}
        className={cardStyles.virtualScrollContainer}
        onKeyDown={handleCardListKeyDown}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map(virtualItem => {
            const result = allResults[virtualItem.index];
            if (!result) return null;
            return (
              <div
                className={cardStyles.virtualRow}
                data-index={virtualItem.index}
                key={result.game.id}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <GameCard
                  game={result.game}
                  lang={lang}
                  meta={meta}
                  publisherQuery={publisherQuery}
                  query={query}
                  t={t}
                  steamApi={steamApi}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SearchResults({
  allResults,
  visibleResults,
  totalCount,
  useVirtualScroll,
  filterVersion,
  lang,
  meta,
  publisherQuery,
  query,
  onClearAll,
  t,
  suggestion,
  onRemoveFilter,
  onClearQuery,
  filterLabel,
  typoSuggestion,
  onTypoSuggestionClick,
  steamApi,
}: SearchResultsProps) {
  if (totalCount === 0) {
    return (
      <section id="game-list" className={cardStyles.gameList} aria-live="polite" aria-busy="false">
        <div className={`${pageStyles.emptyState} ${pageStyles.fadeIn}`}>
          <Gamepad2 className={pageStyles.emptyStateSvg} aria-hidden="true" />
          <div className={pageStyles.emptyStateTitle}>{t('empty.title')}</div>
          <div className={pageStyles.emptyStateDesc}>{t('empty.desc')}</div>
          {query && (
            <div className={pageStyles.emptyStateContext}>
              {t('empty.currentSearch')}: <strong>{query}</strong>
            </div>
          )}
          <button className={pageStyles.emptyClearBtn} type="button" onClick={onClearAll}>
            {t('search.clearAll')}
          </button>
          {suggestion && onRemoveFilter && onClearQuery && filterLabel && (
            <SearchSuggestions
              suggestion={suggestion}
              onRemoveFilter={onRemoveFilter}
              onClearAll={onClearAll}
              onClearQuery={onClearQuery}
              t={t}
              filterLabel={filterLabel}
            />
          )}
          {typoSuggestion && onTypoSuggestionClick && (
            <div className={pageStyles.typoSuggestion}>
              <span>{t('search.didYouMean')} </span>
              <button type="button" className={pageStyles.typoLink} onClick={() => onTypoSuggestionClick(typoSuggestion)}>
                {typoSuggestion}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (useVirtualScroll) {
    return (
      <VirtualizedResults
        allResults={allResults}
        totalCount={totalCount}
        filterVersion={filterVersion}
        lang={lang}
        meta={meta}
        publisherQuery={publisherQuery}
        query={query}
        t={t}
        steamApi={steamApi}
      />
    );
  }

  // Paginated mode (≤ 100 results)
  return (
    <section id="game-list" className={cardStyles.gameList} onKeyDown={handleCardListKeyDown}>
      {visibleResults.map(result => (
        <GameCard
          game={result.game}
          key={result.game.id}
          lang={lang}
          meta={meta}
          publisherQuery={publisherQuery}
          query={query}
          t={t}
          steamApi={steamApi}
        />
      ))}
    </section>
  );
}

