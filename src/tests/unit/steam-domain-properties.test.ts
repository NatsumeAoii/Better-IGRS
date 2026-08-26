import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseSteamAppId,
  steamRatingToIgrsId,
  buildSteamRatingComparison,
  type SteamRatingComparison,
} from '@/shared/lib/steam-domain';
import type { SteamRatingPayload } from '@/shared/types';

const VALID_DESCRIPTOR_STATUSES: SteamRatingComparison['descriptorStatus'][] = [
  'match', 'missing-local', 'missing-steam', 'mismatch', 'unknown',
];
const VALID_RATING_STATUSES: SteamRatingComparison['ratingStatus'][] = [
  'match', 'missing-local', 'missing-steam', 'mismatch', 'unknown',
];
const VALID_IGRS_IDS = new Set([4, 5, 6, 7, 28, 35]);

describe('steam-domain property-based tests', () => {
  describe('parseSteamAppId', () => {
    it('for any numeric string, returns that string unchanged', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[1-9]\d{0,9}$/),
          (numStr) => {
            expect(parseSteamAppId(numStr)).toBe(numStr);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any URL containing a valid numeric app ID, extracts it', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.stringMatching(/^[1-9]\d{0,9}$/),
            host: fc.constantFrom(
              'https://store.steampowered.com',
              'https://steamcommunity.com',
            ),
            suffix: fc.constantFrom('', '/', '/game-name/', '?l=english'),
          }),
          ({ id, host, suffix }) => {
            const url = `${host}/app/${id}${suffix}`;
            expect(parseSteamAppId(url)).toBe(id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('steamRatingToIgrsId', () => {
    it('for valid rating strings, always returns null or a number in {4,5,6,7,28,35}', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constantFrom('0', '3', '3+', '7', '7+', '13', '13+', '15', '15+', '18', '18+', 'RC', 'BANNED', ''),
            fc.stringMatching(/^[A-Z0-9+]{0,10}$/),
          ),
          fc.option(fc.boolean()),
          (rating, banned) => {
            const payload: SteamRatingPayload = { rating, banned: banned === true ? '1' : undefined };
            const result = steamRatingToIgrsId(payload);
            if (result === null) return;
            expect(VALID_IGRS_IDS.has(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('buildSteamRatingComparison', () => {
    it('descriptorStatus and ratingStatus are always valid enum values', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 5 }),
          fc.option(fc.integer({ min: 1, max: 100 })),
          fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 5 }),
          fc.option(fc.integer({ min: 1, max: 100 })),
          fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 5 }),
          fc.option(fc.integer({ min: 1, max: 100 })),
          (computedDesc, computedRating, localDesc, localRating, steamDesc, steamRating) => {
            const result = buildSteamRatingComparison({
              computedDescriptorIds: computedDesc,
              computedRatingId: computedRating,
              localDescriptorIds: localDesc,
              localRatingId: localRating,
              steamDescriptorIds: steamDesc,
              steamRatingId: steamRating,
            });
            expect(VALID_DESCRIPTOR_STATUSES).toContain(result.descriptorStatus);
            expect(VALID_RATING_STATUSES).toContain(result.ratingStatus);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
