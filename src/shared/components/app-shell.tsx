import { ArrowUp, Bug, Code, Copyright, Globe, Moon, Sun, Tag, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@/app/providers/language-provider';
import { useTheme } from '@/app/providers/theme-provider';
import { useDataContext } from '@/app/providers/data-provider';
import { FAVICON_URL } from '@/core/constants';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { MobileNav } from '@/shared/components/mobile-nav';
import { OfflineBanner } from '@/shared/components/offline-banner';
import { useScrollTopVisibility } from '@/shared/hooks/use-scroll-top';

const LazyChangelogModal = lazy(() => import('@/shared/components/changelog-modal'));

const GITHUB_REPO = 'https://github.com/NatsumeAoii/IGRS2nd';
const CURRENT_YEAR = new Date().getUTCFullYear();

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { lang, t, toggleLanguage, unlocked } = useLanguage();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { ensureData } = useDataContext();
  const showScrollTop = useScrollTopVisibility();
  const [showChangelog, setShowChangelog] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const changelogTriggerRef = useRef<HTMLButtonElement>(null);

  // Developer-unlock feedback (#1): the 28-toggle easter egg previously gave
  // no visible confirmation in production. Show a dismissible toast when the
  // unlock transitions on during this session (not on load from storage).
  const [showUnlockToast, setShowUnlockToast] = useState(false);
  const prevUnlockedRef = useRef(unlocked);
  useEffect(() => {
    const wasUnlocked = prevUnlockedRef.current;
    prevUnlockedRef.current = unlocked;
    if (!unlocked || wasUnlocked) return;
    setShowUnlockToast(true);
    const timer = window.setTimeout(() => setShowUnlockToast(false), 8000);
    return () => window.clearTimeout(timer);
  }, [unlocked]);

  // Close the changelog and return focus to its trigger (#38) — same
  // focus-restoration pattern as the mobile nav.
  const closeChangelog = useCallback(() => {
    setShowChangelog(false);
    changelogTriggerRef.current?.focus();
  }, []);

  const handleNavHover = useCallback(() => {
    void ensureData().catch(() => undefined);
  }, [ensureData]);

  return (
    <>
      <a href="#main-content" className="skip-to-content">{t('app.skipToContent')}</a>
      <OfflineBanner />
      <header className="site-header">
        <div className="header-inner">
          <div className="header-top">
            <NavLink to="/" className="site-logo" aria-label={t('app.homeLabel')}>
              <img src={FAVICON_URL} alt="" className="logo-mark" width="36" height="36" />
              <div className="logo-text">Better-<span>IGRS</span></div>
            </NavLink>
            <div className="header-toggles">
              <button className="btn header-theme-toggle" type="button" aria-label={t('app.themeToggle')} onClick={toggleTheme}>
                {resolvedTheme === 'dark'
                  ? <Sun className="ui-icon" aria-hidden="true" />
                  : <Moon className="ui-icon" aria-hidden="true" />}
              </button>
              <button className="btn header-lang-toggle" type="button" aria-label={t('app.langSwitch')} onClick={toggleLanguage}>
                <Globe className="ui-icon" aria-hidden="true" />
                <span>{lang === 'en' ? 'ID' : 'EN'}</span>
              </button>
            </div>
            <MobileNav
              isOpen={mobileNavOpen}
              onOpen={() => setMobileNavOpen(true)}
              onClose={() => setMobileNavOpen(false)}
            />
          </div>
          <nav className="header-actions" aria-label={t('app.navLabel')}>
            <NavLink to="/search/" className="btn" onMouseEnter={handleNavHover}>{t('nav.search')}</NavLink>
            <NavLink to="/ratings/" className="btn" onMouseEnter={handleNavHover}>{t('nav.ratings')}</NavLink>
            <NavLink to="/steamchecker/" className="btn" onMouseEnter={handleNavHover}>{t('nav.steamchecker')}</NavLink>
          </nav>
        </div>
      </header>

      <div id="main-content">
        {children}
      </div>

      <footer className="site-footer">
        <div className="footer-line">
          <span>{t('footer.text')}</span>{' '}
          <a href="https://igrs.id" target="_blank" rel="noopener noreferrer">igrs.id</a>
          <span className="footer-separator" aria-hidden="true">-</span>
          <span className="footer-copyright">
            <Copyright className="ui-icon" aria-hidden="true" />
            <span className="sr-only">Copyright</span>
            <span>{CURRENT_YEAR}</span>
          </span>
        </div>
        <div className="footer-links">
          <a className="footer-link-btn" href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
            <Code className="ui-icon" aria-hidden="true" />
            <span>GitHub</span>
          </a>
          <a className="footer-link-btn" href={`${GITHUB_REPO}/issues/new`} target="_blank" rel="noopener noreferrer" aria-label={t('app.reportIssue')}>
            <Bug className="ui-icon" aria-hidden="true" />
            <span>{t('app.reportIssue')}</span>
          </a>
          <button className="footer-link-btn" type="button" onClick={() => setShowChangelog(true)} aria-label="View changelog" ref={changelogTriggerRef}>
            <Tag className="ui-icon" aria-hidden="true" />
            <span>v{APP_VERSION}</span>
          </button>
        </div>
      </footer>

      {showChangelog && (
        <ErrorBoundary
          fallback={({ resetError }) => (
            <div className="changelog-overlay" role="alert">
              <div className="changelog-modal changelog-error">
                <p>{t('app.changelogError')}</p>
                <button type="button" onClick={resetError}>{t('error.tryAgain')}</button>
              </div>
            </div>
          )}
        >
          <Suspense fallback={<ChangelogLoadingFallback t={t} />}>
            <LazyChangelogModal onClose={closeChangelog} />
          </Suspense>
        </ErrorBoundary>
      )}

      <button
        className={`scroll-top${showScrollTop ? ' visible' : ''}`}
        type="button"
        aria-label={t('app.scrollTop')}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp className="ui-icon" aria-hidden="true" />
      </button>

      {showUnlockToast && (
        <div className="dev-toast" role="status">
          <span className="dev-toast-text">{t('app.devUnlocked')}</span>
          <button
            className="dev-toast-close"
            type="button"
            aria-label={t('app.dismiss')}
            onClick={() => setShowUnlockToast(false)}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

function ChangelogLoadingFallback({ t }: { t: (key: string) => string }) {
  return (
    <div className="changelog-overlay" role="status" aria-label="Loading changelog">
      <div className="changelog-modal changelog-loading">
        <span>{t('app.loadingShort')}</span>
      </div>
    </div>
  );
}
