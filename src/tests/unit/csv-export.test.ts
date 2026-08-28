import { describe, expect, it, vi } from 'vitest';
import { buildCsvDocument, buildCsvRow, CSV_HEADER, CSV_MIME_TYPE, downloadCsvDocument, escapeCsvCell } from '@/features/search/export-csv';
import type { IgrsGame, IgrsMeta } from '@/shared/types';

const meta: IgrsMeta = {
  meta: { generatedAt: '2026-01-01T00:00:00Z', totalGames: 2 },
  ratings: {
    7: { name: 'SU', titleEn: 'Everyone', titleId: 'Semua Umur', weight: 1 },
    6: { name: '18+', titleEn: 'Adults', titleId: 'Dewasa', weight: 5 },
  },
  descriptors: {
    3: { nameEn: 'Violence', nameId: 'Kekerasan' },
  },
  platforms: {
    1: 'PC',
    2: 'Nintendo Switch',
  },
} as unknown as IgrsMeta;

function makeGame(overrides: Partial<IgrsGame> = {}): IgrsGame {
  return {
    id: 1,
    name: 'Alpha Game',
    publisherName: 'North Studio',
    releaseYear: 2024,
    ratings: [7],
    descriptors: [3],
    platforms: [1],
    ...overrides,
  } as IgrsGame;
}

describe('escapeCsvCell', () => {
  it('wraps plain values in quotes', () => {
    expect(escapeCsvCell('Alpha Game')).toBe('"Alpha Game"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('keeps commas and newlines inside quotes', () => {
    expect(escapeCsvCell('A,B')).toBe('"A,B"');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('prefixes formula-like leading characters with a single quote', () => {
    const tick = "'";
    expect(escapeCsvCell('=SUM(A1)')).toBe(`"${tick}=SUM(A1)"`);
    expect(escapeCsvCell('+cmd')).toBe(`"${tick}+cmd"`);
    expect(escapeCsvCell('-2')).toBe(`"${tick}-2"`);
    expect(escapeCsvCell('@import')).toBe(`"${tick}@import"`);
  });

  it('does not prefix safe values that merely contain formula characters', () => {
    expect(escapeCsvCell('Total = 5')).toBe('"Total = 5"');
  });

  it('renders empty values as quoted empty cells', () => {
    expect(escapeCsvCell('')).toBe('""');
  });
});

describe('buildCsvRow', () => {
  it('joins all six columns for a fully populated game', () => {
    const row = buildCsvRow({ game: makeGame() }, meta, 'en');
    expect(row).toBe('"Alpha Game","North Studio","2024","SU","PC","Violence"');
  });

  it('emits empty cells for missing ratings, platforms, and descriptors', () => {
    const row = buildCsvRow(
      { game: makeGame({ ratings: undefined, descriptors: undefined, platforms: undefined }) },
      meta,
      'en'
    );
    expect(row).toBe('"Alpha Game","North Studio","2024","","",""');
  });

  it('uses the requested language for descriptor labels', () => {
    const row = buildCsvRow({ game: makeGame() }, meta, 'id');
    expect(row).toContain('"Kekerasan"');
  });
});

describe('buildCsvDocument', () => {
  it('returns a header-only document for an empty result set', () => {
    expect(buildCsvDocument([], meta, 'en')).toBe(CSV_HEADER);
  });

  it('separates rows with newlines after the header', () => {
    const doc = buildCsvDocument(
      [{ game: makeGame({ id: 1, name: 'A' }) }, { game: makeGame({ id: 2, name: 'B' }) }],
      meta,
      'en'
    );
    const lines = doc.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADER);
  });

  it('neutralizes a formula-injection payload in a game name', () => {
    const tick = "'";
    const doc = buildCsvDocument(
      [{ game: makeGame({ name: '=HYPERLINK("http://evil.example")' }) }],
      meta,
      'en'
    );
    expect(doc).toContain(`"${tick}=HYPERLINK(""http://evil.example"")"`);
  });
});

describe('CSV export plumbing', () => {
  it('declares an explicit UTF-8 MIME type', () => {
    expect(CSV_MIME_TYPE).toBe('text/csv;charset=utf-8');
  });

  it('downloads the document as a UTF-8 blob and starts the download', () => {
    const click = vi.fn();
    const anchor = { click } as unknown as HTMLAnchorElement;
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    expect(downloadCsvDocument('a,b\n1,2')).toBe(true);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(CSV_MIME_TYPE);
    expect(anchor.href).toBe('blob:mock');
    expect(anchor.download).toBe('igrs-search-results.csv');
    expect(click).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});

