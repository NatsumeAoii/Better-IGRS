import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterResultAnnouncement } from '@/features/search/filter-result-announcement';
import { buildSearchResultsModel } from '@/features/search/search-results-model';
import { useSearchIndex } from '@/shared/hooks/use-search-index';
import { usePageTitle } from '@/shared/hooks/use-page-title';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { ErrorState, LoadingState } from '@/shared/components/data-state';
import { GameCardSkeleton } from '@/shared/components/skeleton';
import { FilterSidebar } from '@/features/search/search-filters';
import { SearchHeader } from '@/features/search/search-header';
import { SearchPagination } from '@/features/search/search-pagination';
import { SearchResults } from '@/features/search/search-results';
import { GameDetailInline } from '@/features/search/game-detail-inline';
import { buildActiveFilters } from '@/features/search/build-active-filters';
import { computeSuggestion } from '@/features/search/search-suggestions';
import { buildCsvDocument, downloadCsvDocument } from '@/features/search/export-csv';
import { useSearchFilters } from '@/features/search/use-search-filters';
import { useSearchHistory } from '@/features/search/use-search-history';
import { useDetailPanel } from '@/features/search/use-detail-panel';
import { useSearchShortcut } from '@/features/search/use-search-shortcut';
import { useSteamApi } from '@/shared/hooks/use-steam-api';
import { descriptorName, ratingName } from '@/shared/lib/ratings';
import { platformName } from '@/shared/lib/platforms';
import { fuzzyScoreNormalized } from '@/core/search-index';
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from '@/shared/lib/browser-storage';
import pageStyles from './search-page.module.css';

export function SearchPage() {
  const { lang, t, unlocked } = useLanguage();
  const { data, error, loading, ensureData } = useRequiredIgrsData();
  const steamApi = useSteamApi();
  const { detailId, hideDetail, showDetail } = useDetailPanel();

  // Canonical per-route handled by usePageTitle.
  usePageTitle('Search - IGRSDB', 'Search games in the unofficial IGRS database.');

  const {
    state: { query, publisher, ratings, platforms, descriptors, years, page, sort },
    deferredQuery,
    deferredPublisher,
    actions,
    filterVersion,
    filterOrder,
    hasActiveFilters,
  } = useSearchFilters();

  // Recent-search history store (plan 1.4) — committed on Enter/blur via
  // SearchHeader's onCommitQuery, never on raw keystrokes.
  const searchHistory = useSearchHistory();

  useSearchShortcut();

  const [resultsPerPage, setResultsPerPage] = useState<number>(() => {
    const stored = Number(readSessionStorage('igrs:search-rpp'));
    return stored === 30 || stored === 60 || stored === 99999 ? stored : 30;
  });
  const handleResultsPerPageChange = useCallback((rpp: number) => {
    setResultsPerPage(rpp);
    writeSessionStorage('igrs:search-rpp', String(rpp));
  }, []);

  const publishers = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    data.games.forEach(g => counts.set(g.publisherName, (counts.get(g.publisherName) || 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [data]);

  const { index: searchIndex, loading: indexLoading, error: indexError, retry: retryIndex } = useSearchIndex(
    data?.games ?? null,
    data?.meta ?? null
  );

  const { currentPage, filtered, totalPages, useVirtualScroll, visibleResults } = useMemo(() => buildSearchResultsModel({
    descriptors,
    meta: data?.meta ?? null,
    page,
    platforms,
    publisher: deferredPublisher,
    query: deferredQuery,
    ratings,
    resultsPerPage,
    searchIndex,
    sort,
    years,
  }), [data?.meta, deferredPublisher, deferredQuery, descriptors, page, platforms, ratings, resultsPerPage, searchIndex, sort, years]);

  const selectedGame = (detailId !== null ? data?.gamesById.get(detailId) : undefined) || null;

  // Clamp page to totalPages
  useEffect(() => { if (page > totalPages) actions.setPage(totalPages); }, [page, totalPages, actions]);

  // Scroll to top on page change
  useEffect(() => { if (currentPage > 1) window.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentPage]);

  useEffect(() => {
    if (filterVersion > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const savedRaw = readSessionStorage('igrs:search-scroll');
      const saved = Number(savedRaw);
      if (savedRaw !== null && Number.isFinite(saved) && saved >= 0) {
        window.scrollTo({ top: saved, behavior: 'instant' as ScrollBehavior });
        removeSessionStorage('igrs:search-scroll');
      }
    }
  }, [filterVersion]);

  // Compute suggestion only when results are zero
  const suggestion = useMemo(() => {
    if (filtered.length > 0 || !searchIndex) return null;
    return computeSuggestion(
      searchIndex,
      { query: deferredQuery, publisher: deferredPublisher, ratings, platforms, descriptors, years },
      filterOrder
    );
  }, [filtered.length, searchIndex, deferredQuery, deferredPublisher, ratings, platforms, descriptors, years, filterOrder]);

  const typoSuggestion = useMemo(() => {
    if (filtered.length > 0 || !deferredQuery || !data) return null;
    let best: { name: string; score: number } | null = null;
    for (const game of data.games) {
      const score = fuzzyScoreNormalized(deferredQuery, game.name);
      if (score > 25 && (!best || score > best.score)) {
        best = { name: game.name, score };
      }
    }
    return best && best.score > 25 ? best.name : null;
  }, [filtered.length, deferredQuery, data]);

  const handleTypoSuggestionClick = useCallback((name: string) => {
    actions.setQuery(name);
    actions.setPage(1);
  }, [actions]);

  const handleSelectHistoryQuery = useCallback((value: string) => {
    actions.setQuery(value);
    actions.setPage(1);
  }, [actions]);

  const getFilterLabel = useCallback((filterKey: string, filterValue: string | number): string => {
    const meta_ = data?.meta;
    if (!meta_) return String(filterValue);
    switch (filterKey) {
      case 'rating':
        return `${t('filter.rating')}: ${ratingName(meta_, filterValue as number)}`;
      case 'platform':
        return `${t('filter.platform')}: ${platformName(meta_, filterValue as number, lang)}`;
      case 'descriptor':
        return `${t('filter.descriptor')}: ${descriptorName(meta_, filterValue as number, lang)}`;
      case 'year':
        return `${t('filter.year')}: ${filterValue}`;
      default:
        return String(filterValue);
    }
  }, [data?.meta, lang, t]);

  const exportCSV = useCallback(() => {
    if (!data) return;
    downloadCsvDocument(buildCsvDocument(filtered, data.meta, lang));
  }, [filtered, data, lang]);

  // Error / loading states
  if (error) return <main className="app-layout" data-route-ready="search"><div className="main-content"><ErrorState title={t('data.error.title')} description={t('data.error.desc')} onRetry={() => void ensureData().catch(() => undefined)} retryLabel={t('retry')} /></div></main>;
  if (indexError) return <main className="app-layout" data-route-ready="search"><div className="main-content"><ErrorState title={t('data.error.title')} description={indexError.message} onRetry={retryIndex} retryLabel={t('retry') || 'Retry'} /></div></main>;
  if (loading || !data || indexLoading || !searchIndex) {
    return (
      <main className="app-layout" data-route-ready="search">
        <div className="main-content">
          {indexLoading ? (
            <div className={pageStyles.skeletonGrid}>
              <GameCardSkeleton />
              <GameCardSkeleton />
              <GameCardSkeleton />
              <GameCardSkeleton />
              <GameCardSkeleton />
              <GameCardSkeleton />
            </div>
          ) : (
            <LoadingState label={t('loading')} />
          )}
        </div>
      </main>
    );
  }

  const activeFilters = buildActiveFilters({
    query, publisher, ratings, platforms, descriptors, years,
    meta: data.meta, lang, t,
    setQuery: actions.setQuery,
    setPublisher: actions.setPublisher,
    setRatings: actions.setRatings,
    setPlatforms: actions.setPlatforms,
    setDescriptors: actions.setDescriptors,
    setYears: actions.setYears,
    setPage: actions.setPage,
  });

  const statsText = hasActiveFilters
    ? t('search.stats.filtered').replace('{count}', String(filtered.length)).replace('{total}', String(data.games.length))
    : t('search.stats').replace('{count}', String(filtered.length));

  return (
    <main className={`app-layout${selectedGame ? ' detail-active' : ''}`} data-route-ready="search">
      <div className="main-content">
        {!selectedGame && (
          <SearchHeader
            query={query}
            publisher={publisher}
            onQueryChange={(v) => { actions.setQuery(v); actions.setPage(1); }}
            onPublisherChange={(v) => { actions.setPublisher(v); actions.setPage(1); }}
            statsText={statsText}
            sort={sort}
            onSortChange={(s) => { actions.setSort(s); actions.setPage(1); }}
            activeFilters={activeFilters}
            onClearAll={() => actions.clearAll(true)}
            t={t}
            publishers={publishers}
            onExportCSV={exportCSV}
            historyQueries={searchHistory.history}
            onCommitQuery={searchHistory.commitQuery}
            onSelectHistoryQuery={handleSelectHistoryQuery}
            onRemoveHistoryQuery={searchHistory.removeQuery}
            onClearHistory={searchHistory.clearHistory}
          />
        )}
        <div id="list-view" className={selectedGame ? pageStyles.listViewHidden : undefined}>
          <div className={pageStyles.rppToggle} role="group" aria-label={t('search.resultsPerPage')}>
            {[30, 60].map(rpp => (
              <button key={rpp} type="button" className={`${pageStyles.rppBtn}${resultsPerPage === rpp ? ` ${pageStyles.rppBtnActive}` : ''}`} onClick={() => handleResultsPerPageChange(rpp)} aria-pressed={resultsPerPage === rpp}>
                {rpp}
              </button>
            ))}
            <button type="button" className={`${pageStyles.rppBtn}${resultsPerPage > 1000 ? ` ${pageStyles.rppBtnActive}` : ''}`} onClick={() => handleResultsPerPageChange(99999)} aria-pressed={resultsPerPage > 1000}>
              {t('search.rppAll')}
            </button>
          </div>
          <SearchResults allResults={filtered} visibleResults={visibleResults} totalCount={filtered.length} useVirtualScroll={useVirtualScroll} filterVersion={filterVersion} lang={lang} meta={data.meta} publisherQuery={publisher} query={query} onClearAll={() => actions.clearAll(true)} t={t} suggestion={suggestion} onRemoveFilter={actions.removeFilter} onClearQuery={actions.clearQuery} filterLabel={getFilterLabel} typoSuggestion={typoSuggestion} onTypoSuggestionClick={handleTypoSuggestionClick} steamApi={steamApi} />
          {!useVirtualScroll && <SearchPagination currentPage={currentPage} totalPages={totalPages} setPage={actions.setPage} t={t} />}
        </div>
        <div id="detail-page" className={selectedGame ? pageStyles.detailPageActive : pageStyles.detailPage}>
          {selectedGame ? <GameDetailInline allGames={data.games} game={selectedGame} lang={lang} meta={data.meta} onBack={hideDetail} onNavigate={showDetail} steamApi={steamApi} t={t} unlocked={unlocked} /> : null}
        </div>
      </div>
       <aside className={`sidebar${selectedGame ? ' sidebar--collapsed' : ''}`} id="sidebar" aria-label={t('sidebar.filters')}>
         <div className={pageStyles.sidebarScroll}>
           <FilterSidebar clearAll={actions.clearAll} descriptors={descriptors} lang={lang} meta={data.meta} platforms={platforms} publisher={deferredPublisher} query={deferredQuery} ratings={ratings} searchIndex={searchIndex} setDescriptors={next => { actions.setDescriptors(next); actions.setPage(1); }} setPlatforms={next => { actions.setPlatforms(next); actions.setPage(1); }} setRatings={next => { actions.setRatings(next); actions.setPage(1); }} setYears={next => { actions.setYears(next); actions.setPage(1); }} setPublisher={v => { actions.setPublisher(v); actions.setPage(1); }} t={t} years={years} publishers={publishers} />
         </div>
       </aside>
      <FilterResultAnnouncement resultCount={filtered.length} t={t} />
    </main>
  );
}
