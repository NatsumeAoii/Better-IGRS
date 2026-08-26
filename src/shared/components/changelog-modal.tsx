import { ChevronDown, ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/app/providers/language-provider';
import changelogRaw from '../../../CHANGELOG.md?raw';

const GITHUB_REPO = 'https://github.com/NatsumeAoii/IGRS2nd';

/** Number of versions shown before the "show more" expand. */
const INITIAL_VISIBLE_COUNT = 2;

// ---------------------------------------------------------------------------
// Changelog parsing (same logic runs once on modal mount)
// ---------------------------------------------------------------------------

interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogEntry {
  version: string;
  date: string | null;
  sections: ChangelogSection[];
}

function parseChangelog(content: string): ChangelogEntry[] {
  const lines = content.split('\n');
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const line of lines) {
    const versionMatch = line.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?/);
    if (versionMatch) {
      if (currentEntry) {
        if (currentSection && currentSection.items.length > 0) {
          currentEntry.sections.push(currentSection);
        }
        entries.push(currentEntry);
      }
      currentEntry = {
        version: versionMatch[1] ?? '',
        date: versionMatch[2]?.trim() || null,
        sections: [],
      };
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && currentEntry) {
      if (currentSection && currentSection.items.length > 0) {
        currentEntry.sections.push(currentSection);
      }
      currentSection = {
        title: sectionMatch[1] ?? '',
        items: [],
      };
      continue;
    }

    const itemMatch = line.match(/^- (.+)/);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1] ?? '');
    }
  }

  if (currentEntry) {
    if (currentSection && currentSection.items.length > 0) {
      currentEntry.sections.push(currentSection);
    }
    entries.push(currentEntry);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

interface ChangelogModalProps {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(() => parseChangelog(changelogRaw), []);
  const hasMore = entries.length > INITIAL_VISIBLE_COUNT;
  const hiddenCount = entries.length - INITIAL_VISIBLE_COUNT;
  const visibleEntries = expanded ? entries : entries.slice(0, INITIAL_VISIBLE_COUNT);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open so keyboard/screen-reader users start
  // inside the trap (same pattern as mobile-nav).
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Focus trap (#10.2): cycle Tab/Shift+Tab within the modal
  useEffect(() => {
    function handleFocusTrap(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', handleFocusTrap);
    return () => document.removeEventListener('keydown', handleFocusTrap);
  }, []);

  return (
    <div className="changelog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('changelog.title')}>
      <div className="changelog-modal" ref={modalRef} onClick={event => event.stopPropagation()}>
        <div className="changelog-header">
          <h2 className="changelog-title">{t('changelog.title')}</h2>
          <button className="changelog-close" type="button" onClick={onClose} aria-label={t('changelog.close')} ref={closeButtonRef}>
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
        <div className="changelog-body">
          {visibleEntries.map(entry => (
            <ChangelogVersion key={entry.version} entry={entry} />
          ))}

          {hasMore && !expanded && (
            <button
              className="changelog-expand-btn"
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
            >
              <ChevronDown className="ui-icon" aria-hidden="true" />
              <span>{t('changelog.showOlder').replace('{count}', String(hiddenCount))}</span>
            </button>
          )}

          <div className="changelog-footer-link">
            <a href={`${GITHUB_REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">
              <span>{t('changelog.viewGithub')}</span>
              <ExternalLink className="ui-icon" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-0.125em', marginInlineStart: '0.25rem' }} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangelogVersion({ entry }: { entry: ChangelogEntry }) {
  const displayVersion = entry.version.toLowerCase() === 'unreleased'
    ? 'Unreleased'
    : `v${entry.version}`;

  return (
    <article className="changelog-version">
      <div className="changelog-version-header">
        <span className="changelog-version-tag">{displayVersion}</span>
        {entry.date ? <span className="changelog-version-date">{entry.date}</span> : null}
      </div>
      {entry.sections.map(section => (
        <ChangelogSection key={section.title} title={section.title} items={section.items} />
      ))}
    </article>
  );
}

function ChangelogSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="changelog-section">
      <h3 className="changelog-section-title">{title}</h3>
      <ul className="changelog-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default ChangelogModal;
