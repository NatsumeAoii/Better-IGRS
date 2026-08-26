import { EXTRA_FIELD_PATCHED_LEGACY_TEXT, EXTRA_FIELD_PATCHED_TOKEN } from '@/core/constants';
import { safeHttpUrl } from '@/core/safe-render';

/**
 * Formats an "extra" metadata field value for display.
 * Maps patched-link sentinel values to a localized label and normalizes
 * bare URLs. Kept separate from html.ts so consumers don't pull DOMPurify
 * into the eager bundle.
 */
export function formatExtraField(value: unknown, linksPatchedLabel: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text === EXTRA_FIELD_PATCHED_TOKEN || text === EXTRA_FIELD_PATCHED_LEGACY_TEXT) {
    return linksPatchedLabel;
  }
  return safeHttpUrl(text)?.href || text;
}
