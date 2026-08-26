import { filterIndexedGames, fuzzyScoreNormalized, sortFilterResults, type FilterResult } from '@/core/search-index';
import { SEARCH_RESULTS_PER_PAGE, VIRTUAL_SCROLL_THRESHOLD } from '@/features/search/search-constants';
import { ratingWeight } from '@/shared/lib/ratings';
import type { IgrsMeta, SearchIndex, SearchSort } from '@/shared/types';

interface BuildSearchResultsModelInput {
  descriptors: Set<number>;
  meta: IgrsMeta | null;
  page: number;
  platforms: Set<number>;
  publisher: string;
  query: string;
  ratings: Set<number>;
  resultsPerPage?: number;
  searchIndex: SearchIndex | null;
  sort: SearchSort;
  years: Set<string>;
}

export interface SearchResultsModel {
  currentPage: number;
  filtered: FilterResult[];
  totalPages: number;
  useVirtualScroll: boolean;
  visibleResults: FilterResult[];
}

const EMPTY_RESULTS_MODEL: SearchResultsModel = {
  currentPage: 1,
  filtered: [],
  totalPages: 1,
  useVirtualScroll: false,
  visibleResults: [],
};

export function buildSearchResultsModel({
  descriptors,
  meta,
  page,
  platforms,
  publisher,
  query,
  ratings,
  resultsPerPage,
  searchIndex,
  sort,
  years,
}: BuildSearchResultsModelInput): SearchResultsModel {
  if (!searchIndex || !meta) return EMPTY_RESULTS_MODEL;

  const perPage = resultsPerPage && resultsPerPage > 0 ? resultsPerPage : SEARCH_RESULTS_PER_PAGE;

  const filtered = filterIndexedGames(searchIndex.items, {
    descriptors,
    platforms,
    publisher,
    query,
    ratings,
    years,
  }, fuzzyScoreNormalized);

  sortFilterResults(filtered, sort, ratingId => ratingWeight(meta, ratingId));

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visibleResults = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  return {
    currentPage,
    filtered,
    totalPages,
    useVirtualScroll: filtered.length > VIRTUAL_SCROLL_THRESHOLD,
    visibleResults,
  };
}
