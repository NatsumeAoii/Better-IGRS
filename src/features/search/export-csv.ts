/**
 * CSV export building for search results.
 *
 * Hardened per the improvement plan:
 * - Cells beginning with `=`, `+`, `-`, or `@` are prefixed with a single
 *   quote before CSV escaping so spreadsheet applications do not interpret
 *   them as formulas (CSV formula injection).
 * - Every cell is quoted with RFC 4180 escaping (internal `"` doubled).
 * - The download Blob carries an explicit UTF-8 MIME type.
 */
import type { IgrsGame, IgrsMeta } from '@/shared/types';
import { descriptorIdsFromGame, descriptorName, ratingName } from '@/shared/lib/ratings';
import { platformIdsFromGame, platformName } from '@/shared/lib/platforms';

/** Characters spreadsheet applications may treat as formula starts. */
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

/**
 * Escape a single CSV cell: neutralize formula-like leading characters and
 * quote the value with RFC 4180 escaping.
 */
export function escapeCsvCell(value: string): string {
  const normalized = String(value ?? '');
  const guarded = FORMULA_PREFIX_PATTERN.test(normalized) ? `'${normalized}` : normalized;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export interface CsvGameRowInput {
  game: IgrsGame;
}

/** Column header row for the search-results export. */
export const CSV_HEADER = 'Name,Publisher,Year,Rating,Platforms,Descriptors';

/**
 * Build one CSV row for a game. Lookup labels degrade to empty strings when
 * the meta lookup cannot resolve an id, mirroring the on-screen rendering.
 */
export function buildCsvRow({ game }: CsvGameRowInput, meta: IgrsMeta, lang: 'en' | 'id'): string {
  const ratingId = game.ratings?.[0];
  const ratingLabel = ratingId !== undefined ? ratingName(meta, ratingId) : '';
  const platformLabels = platformIdsFromGame(meta, game).map(id => platformName(meta, id, lang)).join(';');
  const descriptorLabels = descriptorIdsFromGame(game).map(id => descriptorName(meta, id, lang)).join(';');

  return [
    escapeCsvCell(game.name),
    escapeCsvCell(game.publisherName),
    escapeCsvCell(String(game.releaseYear)),
    escapeCsvCell(ratingLabel),
    escapeCsvCell(platformLabels),
    escapeCsvCell(descriptorLabels),
  ].join(',');
}

/**
 * Build the complete CSV document for the current result set.
 * An empty result set still yields a valid header-only document.
 */
export function buildCsvDocument(rows: readonly CsvGameRowInput[], meta: IgrsMeta, lang: 'en' | 'id'): string {
  return [CSV_HEADER, ...rows.map(row => buildCsvRow(row, meta, lang))].join('\n');
}

/** MIME type used for the export Blob so spreadsheets read UTF-8 correctly. */
export const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

/**
 * Trigger a client-side download of the CSV document.
 * Returns false when the browser blocks programmatic downloads.
 */
export function downloadCsvDocument(csv: string, filename = 'igrs-search-results.csv'): boolean {
  try {
    const blob = new Blob([csv], { type: CSV_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // Revoke after a macrotask so the download has started before the URL dies.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
