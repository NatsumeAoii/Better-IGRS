import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { renderSteamDescription } from '@/core/steam-description';
import { safeHttpUrl } from '@/core/safe-render';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { createSteamApi, isSteamProxyError } from '@/shared/api/steam-api';
import { ErrorState, LoadingState } from '@/shared/components/data-state';
import { isAbortError } from '@/shared/lib/abort';
import { parseSteamAppId } from '@/shared/lib/steam-domain';
import { sanitizeHtml, stripHtml } from '@/shared/lib/html';
import { SteamCheckerSidebar } from '@/features/steam-checker/steam-checker-sidebar';
import { usePageTitle } from '@/shared/hooks/use-page-title';
import styles from './steam-checker-page.module.css';
import type { SteamGameDetails, SteamReviewSummary } from '@/shared/types';

type CheckerState =
  | { status: 'idle' }
  | { status: 'loading'; appId: string }
  | { status: 'error'; appId: string; message: string; isProxyError?: boolean }
  | { status: 'success'; appId: string; reviewSummary: SteamReviewSummary | null; steamGame: SteamGameDetails };

const HISTORY_KEY = 'steam-checker-history';
const getHistory = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
};
const addHistoryEntry = (appId: string, setter: (ids: string[]) => void) => {
  const history = [appId, ...getHistory().filter(id => id !== appId)].slice(0, 5);
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage blocked */ }
  setter(history);
};

/**
 * Result persistence (#4): the last successful checks are cached in
 * sessionStorage so returning to the page restores the previous result
 * instantly without a network round-trip. Entries are keyed by app ID and
 * pruned to the same 5-entry window as the history list.
 */
const RESULT_CACHE_PREFIX = 'steam-checker-result:';

interface CachedResult {
  appId: string;
  checkedAt: number;
  reviewSummary: SteamReviewSummary | null;
  steamGame: SteamGameDetails;
}

function readCachedResult(appId: string): CachedResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_CACHE_PREFIX + appId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedResult> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.appId !== appId) return null;
    if (!parsed.steamGame || typeof parsed.steamGame !== 'object') return null;
    return {
      appId: parsed.appId,
      checkedAt: Number(parsed.checkedAt) || 0,
      reviewSummary: parsed.reviewSummary ?? null,
      steamGame: parsed.steamGame
    };
  } catch {
    return null;
  }
}

function cacheResult(appId: string, reviewSummary: SteamReviewSummary | null, steamGame: SteamGameDetails): void {
  try {
    sessionStorage.setItem(
      RESULT_CACHE_PREFIX + appId,
      JSON.stringify({ appId, checkedAt: Date.now(), reviewSummary, steamGame } satisfies CachedResult)
    );
    // Prune cached results that fell outside the history window.
    const keep = new Set(getHistory());
    const staleKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(RESULT_CACHE_PREFIX) && !keep.has(key.slice(RESULT_CACHE_PREFIX.length))) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) sessionStorage.removeItem(key);
  } catch { /* storage blocked or full — caching is best-effort */ }
}

export function SteamCheckerPage() {
  const { lang, t, unlocked } = useLanguage();
  const { data, error, loading, ensureData } = useRequiredIgrsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(() => parseSteamAppId(searchParams.get('appid') || '') || searchParams.get('appid') || '');
  const [checkerState, setCheckerState] = useState<CheckerState>({ status: 'idle' });
  const [history, setHistory] = useState<string[]>(getHistory);
  const latestRequestIdRef = useRef(0);
  const latestAbortControllerRef = useRef<AbortController | null>(null);
  const lastSubmittedAppIdRef = useRef<string>('');
  // Create the Steam API instance once (lazy useState) so its internal cache
  // survives re-renders and language toggles; `t` is only used for error messages.
  const [steamApi] = useState(() => createSteamApi({ t }));

  const submitCheck = useCallback(async (rawAppId: string, options?: { updateUrl?: boolean }) => {
    const shouldUpdateUrl = options?.updateUrl ?? true;
    latestAbortControllerRef.current?.abort();
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const abortController = new AbortController();
    latestAbortControllerRef.current = abortController;
    const isLatestRequest = () => latestRequestIdRef.current === requestId;
    const appId = parseSteamAppId(rawAppId);
    if (!/^\d+$/.test(appId)) {
      setCheckerState({ status: 'error', appId: rawAppId, message: t('steamchecker.error.invalid') });
      return;
    }

    setInput(appId);
    setCheckerState({ status: 'loading', appId });

    try {
      const [payload, reviewSummary] = await Promise.all([
        steamApi.fetchSteamAppDetails(appId, { signal: abortController.signal }),
        steamApi.fetchSteamReviewSummary(appId, { signal: abortController.signal })
      ]);
      const result = payload[appId];
      if (!result?.success || !result.data) {
        throw new Error(t('steamchecker.error.notfound'));
      }
      if (!isLatestRequest()) return;
      lastSubmittedAppIdRef.current = appId;
      if (shouldUpdateUrl) {
        setSearchParams({ appid: appId }, { replace: false });
      }
      setCheckerState({ status: 'success', appId, reviewSummary, steamGame: result.data });
      addHistoryEntry(appId, setHistory);
      cacheResult(appId, reviewSummary, result.data);
    } catch (nextError) {
      if (isAbortError(nextError)) return;
      if (!isLatestRequest()) return;
      const message = nextError instanceof Error ? nextError.message : t('steamchecker.error.load');
      setCheckerState({ status: 'error', appId, message, isProxyError: isSteamProxyError(nextError) });
    }
  }, [setSearchParams, steamApi, t]);

  // Auto-initiate lookup on page load or when URL changes (back/forward navigation)
  useEffect(() => {
    const urlAppId = parseSteamAppId(searchParams.get('appid') || '');
    if (!urlAppId) {
      // URL has no appid — instantly restore the most recent successful check
      // from sessionStorage so results survive in-app navigation (#4).
      const [lastAppId] = getHistory();
      const cached = lastAppId ? readCachedResult(lastAppId) : null;
      if (cached) {
        lastSubmittedAppIdRef.current = cached.appId;
        setInput(cached.appId);
        setCheckerState({ status: 'success', appId: cached.appId, reviewSummary: cached.reviewSummary, steamGame: cached.steamGame });
        // Reflect the restored check in the URL (replace — no history spam).
        setSearchParams({ appid: cached.appId }, { replace: true });
        return;
      }
      // Nothing to restore — reset to idle if we were showing results from a previous lookup
      if (checkerState.status !== 'idle') {
        setCheckerState({ status: 'idle' });
        setInput('');
        lastSubmittedAppIdRef.current = '';
      }
      return;
    }
    // Only re-fetch if the URL app ID differs from what we last submitted
    if (urlAppId === lastSubmittedAppIdRef.current) return;
    void submitCheck(urlAppId, { updateUrl: false });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  usePageTitle('Steam Checker - IGRSDB', 'Check Steam game details against IGRS ratings and content descriptors.');

  // Abort any in-flight request on unmount to prevent memory leaks
  useEffect(() => {
    return () => { latestAbortControllerRef.current?.abort(); };
  }, []);

  if (error) {
    return (
      <main className={`${styles.pageContainer} ${styles.steamCheckerPage}`} data-route-ready="steamchecker">
          <ErrorState title={t('data.error.title')} description={t('data.error.desc')} onRetry={() => void ensureData().catch(() => undefined)} retryLabel={t('retry')} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className={`${styles.pageContainer} ${styles.steamCheckerPage}`} data-route-ready="steamchecker">
        <LoadingState label={t('loading')} />
      </main>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCheck(input);
  };

  const isValidInput = !input || /^\d*$/.test(parseSteamAppId(input) || input);

  return (
    <main className={`${styles.pageContainer} ${styles.steamCheckerPage}`} id="steam-checker-page" data-route-ready="steamchecker">
      <section className={styles.hero}>
        <div>
          <h1 className={styles.pageTitle}>{t('steamchecker.title')}</h1>
        </div>
      </section>

      <section className={styles.shell}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="steam-appid-input">{t('steamchecker.appid')}</label>
          <div className={styles.inputRow}>
            <input
              type="text"
              id="steam-appid-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('steamchecker.appid.placeholder')}
              value={input}
              className={!isValidInput ? styles.inputError : undefined}
              onChange={event => setInput(event.currentTarget.value)}
            />
            <button className={styles.submitButton} type="submit">{t('steamchecker.check')}</button>
          </div>
        </form>

        {history.length > 0 && checkerState.status === 'idle' && (
          <div className={styles.historyRow}>
            {history.map(id => (
              <button key={id} type="button" className={styles.historyChip} onClick={() => { setInput(id); void submitCheck(id); }}>
                {id}
              </button>
            ))}
          </div>
        )}

        <div className={styles.status} aria-live="polite">
          {checkerState.status === 'idle' ? t('steamchecker.empty') : null}
          {checkerState.status === 'loading' ? t('steamchecker.loading') : null}
          {checkerState.status === 'error' ? checkerState.message : null}
        </div>
        <div className={styles.layout}>
          <div className={styles.main}>
            <SteamCheckerMain state={checkerState} onRetry={appId => void submitCheck(appId)} t={t} />
          </div>
          <aside className={styles.sidebar}>
            {checkerState.status === 'success' ? (
              <SteamCheckerSidebar
                games={data.games}
                gamesByNormalizedName={data.gamesByNormalizedName}
                lang={lang}
                meta={data.meta}
                reviewSummary={checkerState.reviewSummary}
                steamGame={checkerState.steamGame}
                steamMeta={data.steamMeta}
                unlocked={unlocked}
                appId={checkerState.appId}
                t={t}
              />
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}

function SteamCheckerMain({ onRetry, state, t }: { onRetry: (appId: string) => void; state: CheckerState; t: (key: string) => string }) {
  const [descExpanded, setDescExpanded] = useState(false);

  const currentAppId = state.status !== 'idle' ? state.appId : null;
  useEffect(() => { setDescExpanded(false); }, [currentAppId]);

  if (state.status === 'idle') {
    return (
      <div className={`${styles.emptyState} ${styles.fadeIn}`}>
        <div className={styles.emptyStateTitle}>{t('steamchecker.title')}</div>
        <div className={styles.emptyStateDesc}>{t('steamchecker.subtitle')}</div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className={`${styles.emptyState} ${styles.fadeIn}`}>
        <div className={styles.loadingSpinner} />
        <div className={styles.emptyStateTitle}>{t('steamchecker.loading')}</div>
        <div className={styles.emptyStateDesc}>{state.appId}</div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={`${styles.emptyState} ${styles.fadeIn}`}>
        <div className={styles.emptyStateTitle}>
          {state.isProxyError ? t('steamchecker.tempUnavailable') : state.message}
        </div>
        <div className={styles.emptyStateDesc}>
          {state.isProxyError
            ? t('steamchecker.proxyUnreachable')
            : t('steamchecker.error.load')}
        </div>
        {parseSteamAppId(state.appId) ? (
          <button className={`detail-link-btn ${styles.emptyRetryBtn}`} type="button" onClick={() => onRetry(state.appId)}>
            {t('steamchecker.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  const authorName = state.steamGame.developers?.[0] || state.steamGame.publishers?.[0] || t('steamchecker.unknown');
  const descriptionRaw = state.steamGame.detailed_description || state.steamGame.about_the_game || '';
  const description = stripHtml(descriptionRaw) || t('detail.noDesc');
  const steamStoreUrl = `https://store.steampowered.com/app/${state.appId}`;
  const headerImageUrl = safeHttpUrl(state.steamGame.header_image || '');

  return (
    <section className={`detail-card ${styles.fadeIn} ${styles.resultCard}`}>
      {headerImageUrl ? (
        <img src={headerImageUrl.href} alt="" loading="lazy" width={460} height={215} />
      ) : null}
      <div className={`detail-header ${styles.resultHeader}`}>
        <div className={styles.resultTitleBlock}>
          <div className="detail-title">{state.steamGame.name || t('steamchecker.unknown')}</div>
          <div className="detail-publisher">{authorName}</div>
        </div>
        <div className={styles.resultHeaderActions}>
          <a className={`detail-link-btn ${styles.resultStoreBtn}`} href={steamStoreUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className={styles.icon} aria-hidden="true" />
            <span>{t('steamchecker.goToStore')}</span>
          </a>
          <a className={`detail-link-btn ${styles.resultStoreBtn}`} href={`https://steamdb.info/app/${state.appId}/`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className={styles.icon} aria-hidden="true" />
            <span>SteamDB</span>
          </a>
        </div>
      </div>
      <div className={`${styles.resultDescriptionShell}${descExpanded ? '' : ` ${styles.resultDescriptionCollapsed}`}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderSteamDescription(description)) }} />
      <button className={styles.descToggleBtn} type="button" onClick={() => setDescExpanded(prev => !prev)}>
        {descExpanded ? t('steamchecker.showLess') : t('steamchecker.showMore')}
      </button>
    </section>
  );
}
