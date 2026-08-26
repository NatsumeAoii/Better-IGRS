import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18N } from '@/core/i18n';

const enKeys = Object.keys(I18N.en);
const idKeys = Object.keys(I18N.id);

// Vitest runs from the repo root; jsdom replaces import.meta.url with an
// http URL, so the public dictionaries are resolved relative to cwd.
const i18nDir = resolve(process.cwd(), 'public/assets/i18n');

describe('i18n runtime key validation', () => {
  it('every EN key exists in ID dictionary', () => {
    const idSet = new Set(idKeys);
    const missing = enKeys.filter(k => !idSet.has(k));
    expect(missing).toEqual([]);
  });

  it('every ID key exists in EN dictionary', () => {
    const enSet = new Set(enKeys);
    const missing = idKeys.filter(k => !enSet.has(k));
    expect(missing).toEqual([]);
  });

  it('no EN keys have empty string values', () => {
    const empty = enKeys.filter(k => I18N.en[k as keyof typeof I18N.en] === '');
    expect(empty).toEqual([]);
  });

  it('no ID keys have empty string values', () => {
    const empty = idKeys.filter(k => I18N.id[k as keyof typeof I18N.id] === '');
    expect(empty).toEqual([]);
  });

  // JSON.parse silently keeps the last duplicate, so a pasted-in repeat of a
  // key would quietly shadow the intended translation — catch it at test time.
  it('public dictionaries contain no duplicate keys', () => {
    for (const lang of ['en', 'id']) {
      const raw = readFileSync(resolve(i18nDir, `${lang}.json`), 'utf8');
      const counts = new Map<string, number>();
      for (const match of raw.matchAll(/^\s*"([^"]+)"\s*:/gm)) {
        counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      }
      const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key);
      expect(duplicates).toEqual([]);
    }
  });
});
