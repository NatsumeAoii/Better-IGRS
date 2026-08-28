import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { renderSteamDescription } from '@/core/steam-description';
import { safeHttpUrl } from '@/core/safe-render';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { createSteamApi, isSteamProxyError } from '@/shared/api/steam-api';
import { ErrorState, LoadingState } from '@/shared/components/data-state';
import { isAbortError } from '@/shared/lib/abort';
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from '@/shared/lib/browser-storage';
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
  const raw = readSessionStorage(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => /^\d+$/.test(id)).slice(0, 5);
  } catch { return []; }
};
const addHistoryEntry = (appId: string, setter: (ids: string[]) => void) => {
  const history = [appId, ...getHistory().filter(id => id !== appId)].slice(0, 5);
  writeSessionStorage(HISTORY_KEY, JSON.stringify(history));
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
    const raw = readSessionStorage(RESULT_CACHE_PREFIX + appId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedResult> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.appId !== appId) return null;
    if (!parsed.steamGame || typeof parsed.steamGame !== 'object') return null;
    if (!Number.isFinite(Number(parsed.checkedAt)) || Number(parsed.checkedAt) <= 0) return null;
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
    writeSessionStorage(
      RESULT_CACHE_PREFIX + appId,
      JSON.stringify({ appId, checkedAt: Date.now(), reviewSummary, steamGame } satisfies CachedResult)
    );
    // Prune cached results that fell outside the history window.
    const keep = new Set(getHistory());
    const staleKeys: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < window.sessionStorage.length; i += 1) {
          const key = window.sessionStorage.key(i);
          if (key?.startsWith(RESULT_CACHE_PREFIX) && !keep.has(key.slice(RESULT_CACHE_PREFIX.length))) staleKeys.push(key);
        }
        for (const key of staleKeys) removeSessionStorage(key);
      } catch { /* storage blocked or full — caching is best-effort */ }
    }
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
  const [imageViewerUrls, setImageViewerUrls] = useState<URL[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const imageTriggerRef = useRef<HTMLElement | null>(null);
  const imageViewerCloseRef = useRef<HTMLButtonElement>(null);
  const imageViewerDialogRef = useRef<HTMLDivElement>(null);

  const currentAppId = state.status !== 'idle' ? state.appId : null;
  useEffect(() => {
    setDescExpanded(false);
    setImageViewerUrls([]);
    setImageViewerIndex(0);
  }, [currentAppId]);

  const closeImageViewer = useCallback(() => {
    setImageViewerUrls([]);
    setImageViewerIndex(0);
    imageTriggerRef.current?.focus();
  }, []);

  const moveImageViewer = useCallback((direction: number) => {
    setImageViewerIndex(index => (index + direction + imageViewerUrls.length) % imageViewerUrls.length);
  }, [imageViewerUrls.length]);

  useEffect(() => {
    if (!imageViewerUrls.length) return;
    imageViewerCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeImageViewer();
      if (event.key === 'ArrowLeft') moveImageViewer(-1);
      if (event.key === 'ArrowRight') moveImageViewer(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeImageViewer, imageViewerUrls.length, moveImageViewer]);

  // Lock background scroll while the viewer is open — same pattern as
  // changelog-modal/mobile-nav (#10.2) — so the page behind cannot be
  // scrolled or otherwise interacted with until the image is closed.
  useEffect(() => {
    if (!imageViewerUrls.length) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [imageViewerUrls.length]);

  // Focus trap: cycle Tab/Shift+Tab within the viewer dialog only.
  useEffect(() => {
    if (!imageViewerUrls.length) return;
    function handleFocusTrap(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const dialog = imageViewerDialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
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
  }, [imageViewerUrls.length]);

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
  const screenshots = (state.steamGame.screenshots || [])
    .map(screenshot => safeHttpUrl(screenshot.path_full || screenshot.path_thumbnail || ''))
    .filter((url): url is URL => url !== null)
    .slice(0, 6);
  const minimumRequirements = stripHtml(state.steamGame.pc_requirements?.minimum || '');
  const recommendedRequirements = stripHtml(state.steamGame.pc_requirements?.recommended || '');
  const openImageViewer = (url: URL, trigger: HTMLElement, gallery: URL[]) => {
    imageTriggerRef.current = trigger;
    const uniqueGallery = gallery.filter((item, index) => gallery.findIndex(candidate => candidate.href === item.href) === index);
    setImageViewerUrls(uniqueGallery);
    setImageViewerIndex(Math.max(0, uniqueGallery.findIndex(item => item.href === url.href)));
  };
  const openDescriptionImage = (event: MouseEvent<HTMLDivElement>) => {
    const image = (event.target as HTMLElement).closest<HTMLImageElement>('.steam-description-image');
    const url = image ? safeHttpUrl(image.currentSrc || image.src) : null;
    const gallery = Array.from(event.currentTarget.querySelectorAll<HTMLImageElement>('.steam-description-image'))
      .map(item => safeHttpUrl(item.currentSrc || item.src))
      .filter((item): item is URL => item !== null);
    if (image && url) openImageViewer(url, image, gallery);
  };
  const imageViewerUrl = imageViewerUrls[imageViewerIndex] ?? null;
  const steamStoreUrl = `https://store.steampowered.com/app/${state.appId}`;
  const headerImageUrl = safeHttpUrl(state.steamGame.header_image || '');

  return (
    <section className={`detail-card ${styles.fadeIn} ${styles.resultCard}`}>
      {headerImageUrl ? (
        <img src={headerImageUrl.href} alt="" loading="lazy" decoding="async" width={460} height={215} />
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
      <div className={`${styles.resultDescriptionShell}${descExpanded ? '' : ` ${styles.resultDescriptionCollapsed}`}`} onClick={openDescriptionImage} dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderSteamDescription(description)) }} />
      <button className={styles.descToggleBtn} type="button" onClick={() => setDescExpanded(prev => !prev)}>
        {descExpanded ? t('steamchecker.showLess') : t('steamchecker.showMore')}
      </button>
      {screenshots.length ? (
        <section className={styles.screenshots} aria-label={t('steamchecker.screenshots')}>
          <h2>{t('steamchecker.screenshots')}</h2>
          <div className={styles.screenshotGrid}>
            {screenshots.map((url, index) => (
              <button key={url.href} type="button" onClick={event => openImageViewer(url, event.currentTarget, screenshots)} aria-label={t('steamchecker.openImage').replace('{number}', String(index + 1))}>
                <img src={url.href} alt={`${state.steamGame.name || t('steamchecker.unknown')} screenshot ${index + 1}`} loading="lazy" decoding="async" width={320} height={180} />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {minimumRequirements || recommendedRequirements ? (
        <section className={styles.requirements}>
          <h2>{t('steamchecker.pcRequirements')}</h2>
          {minimumRequirements ? <div><h3>{t('steamchecker.minimum')}</h3><p>{minimumRequirements}</p></div> : null}
          {recommendedRequirements ? <div><h3>{t('steamchecker.recommended')}</h3><p>{recommendedRequirements}</p></div> : null}
        </section>
      ) : null}
      {imageViewerUrl && typeof document !== 'undefined' ? createPortal(
        <div className={styles.imageViewer} role="dialog" aria-modal="true" aria-label={t('steamchecker.imageViewer')} onClick={closeImageViewer}>
          <div className={styles.imageViewerContent} ref={imageViewerDialogRef} onClick={event => event.stopPropagation()}>
            <button className={styles.imageViewerClose} ref={imageViewerCloseRef} type="button" onClick={closeImageViewer} aria-label={t('steamchecker.closeImage')}>
              <X aria-hidden="true" />
            </button>
            {imageViewerUrls.length > 1 ? <button className={`${styles.imageViewerNav} ${styles.imageViewerPrev}`} type="button" onClick={() => moveImageViewer(-1)} aria-label={t('steamchecker.previousImage')}><ChevronLeft aria-hidden="true" /></button> : null}
            <img src={imageViewerUrl.href} alt={t('steamchecker.imageViewer')} />
            {imageViewerUrls.length > 1 ? <button className={`${styles.imageViewerNav} ${styles.imageViewerNext}`} type="button" onClick={() => moveImageViewer(1)} aria-label={t('steamchecker.nextImage')}><ChevronRight aria-hidden="true" /></button> : null}
          </div>
        </div>
      , document.body) : null}
    </section>
  );
}
