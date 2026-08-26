import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { FAVICON_URL, RATING_ORDER } from '@/core/constants';
import { fuzzyScoreNormalized } from '@/core/search-index';
import { normalizeSearchText } from '@/core/search-text';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { ErrorState, LoadingState } from '@/shared/components/data-state';
import { IMG_RATING, IMG_RATING_WEBP, ratingIdsFromGame, ratingName, ratingTitle } from '@/shared/lib/ratings';
import { formatLocalDateTime24 } from '@/shared/lib/format';
import { useRecentlyViewed, clearRecentlyViewed } from '@/shared/hooks/use-recently-viewed';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { usePageTitle } from '@/shared/hooks/use-page-title';
import type { IgrsGame, IgrsMeta } from '@/shared/types';
import styles from './home-page.module.css';

export function HomePage() {
  const { lang, t } = useLanguage();
  const { data, error, loading, ensureData } = useRequiredIgrsData();
  const recentIds = useRecentlyViewed();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [idInput, setIdInput] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(searchQuery, 200);
  const suggestions = useMemo(() => {
    const q = normalizeSearchText(debouncedQuery);
    if (q.length < 2) return [];
    return data?.games
      .map(g => ({ game: g, score: fuzzyScoreNormalized(debouncedQuery, g.name) }))
      .filter(s => s.score > 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) ?? [];
  }, [debouncedQuery, data?.games]);

  const handleIdSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseInt(idInput, 10);
    if (data?.gamesById.has(id)) navigate(`/game/${id}`);
  };

  usePageTitle(
    t('home.title.prefix') + t('home.title.accent') + t('home.title.suffix') + t('home.title.bottom') + ' - IGRSDB',
    t('home.subtitle')
  );

  const handleSearchSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      navigate(`/search/?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/search/');
    }
  }, [searchQuery, navigate]);

  // "/" keyboard shortcut to focus search input on desktop
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (error) {
    return (
      <main className={styles.hero} data-route-ready="home">
          <ErrorState title={t('data.error.title')} description={t('data.error.desc')} onRetry={() => void ensureData().catch(() => undefined)} retryLabel={t('retry')} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className={styles.hero} data-route-ready="home">
        <LoadingState label={t('loading')} />
      </main>
    );
  }

  const publishers = data.stats.publisherCount;
  const platforms = data.stats.platformCount;
  const updatedAt = formatLocalDateTime24(data.meta.meta?.generatedAt);
  const recentGames = recentIds
    .map(id => data.gamesById.get(id))
    .filter((g): g is IgrsGame => g !== undefined);

  return (
    <main className={styles.hero} data-route-ready="home">
      <div className={styles.heroContent}>
        <img src={FAVICON_URL} alt="" className={styles.heroLogo} width={260} height={260} />
        <h1 className={styles.heroTitle}>
          {t('home.title.prefix')}
          <span className={styles.heroTitleAccent}>{t('home.title.accent')}</span>
          {t('home.title.suffix')}
          <br />
          {t('home.title.bottom')}
        </h1>
        <p className={styles.heroSubtitle}>{t('home.subtitle')}</p>

        <form className={styles.quickSearch} onSubmit={handleSearchSubmit} role="search">
          <Search size={18} className={styles.quickSearchIcon} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            className={styles.quickSearchInput}
            placeholder={t('home.cta.search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            aria-label={t('home.searchPlaceholder')}
          />
          <kbd className={styles.quickSearchKbd}>/</kbd>
          {suggestions.length > 0 && searchFocused && (
            <ul className={styles.autocompleteList} role="listbox">
              {suggestions.map(s => (
                <li key={s.game.id} role="option" className={styles.autocompleteItem} onMouseDown={() => navigate(`/game/${s.game.id}`)}>
                  <span className={styles.autocompleteName}>{s.game.name}</span>
                  <span className={styles.autocompleteMeta}>{s.game.publisherName} · {s.game.releaseYear}</span>
                </li>
              ))}
            </ul>
          )}
        </form>

        <form className={styles.idLookup} onSubmit={handleIdSubmit}>
          <input type="text" inputMode="numeric" placeholder={t('home.idLookupPlaceholder')} value={idInput} onChange={e => setIdInput(e.target.value)} aria-label={t('home.idLookupLabel')} className={styles.idInput} />
          <button type="submit" className={styles.idBtn}>{t('home.idLookupGo')}</button>
        </form>

        <div className={styles.heroStats} id="hero-stats">
          <div className={styles.heroStat}>
            <span className={styles.heroStatNum}>{data.games.length}</span>
            <span className={styles.heroStatLabel}>{t('home.stat.games')}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatNum}>{publishers}</span>
            <span className={styles.heroStatLabel}>{t('home.stat.publishers')}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatNum}>{platforms}</span>
            <span className={styles.heroStatLabel}>{t('home.stat.platforms')}</span>
          </div>
          <div className={`${styles.heroStat} ${styles.heroStatWide}`}>
            <span className={`${styles.heroStatNum} ${styles.heroStatNumUpdated}`}>{updatedAt}</span>
            <span className={styles.heroStatLabel}>{t('home.stat.updated')}</span>
          </div>
        </div>

        <RecentlyRatedSection games={data.games.slice(0, 6)} meta={data.meta} t={t} />
        <RatingDistributionSection games={data.games} meta={data.meta} t={t} />

        <div className={styles.heroActions}>
          <Link to="/search/" className={styles.heroBtnPrimary}>{t('home.cta.search')}</Link>
          <Link to="/ratings/" className={styles.heroBtnSecondary}>{t('home.cta.ratings')}</Link>
        </div>

        <div className={styles.heroRatings} id="hero-ratings">
          {RATING_ORDER.filter(id => data.meta.ratings[String(id)]).map(id => (
            <Link to={`/search/?rating=${id}`} title={ratingTitle(data.meta, id, lang)} key={id}>
              <picture>
                <source srcSet={IMG_RATING_WEBP(id)} type="image/webp" />
                <img src={IMG_RATING(id)} alt={ratingName(data.meta, id)} width={56} height={56} />
              </picture>
            </Link>
          ))}
        </div>

        {recentGames.length > 0 ? (
          <RecentlyViewedSection games={recentGames} meta={data.meta} t={t} />
        ) : null}
      </div>
    </main>
  );
}

function RecentlyViewedSection({ games, meta, t }: { games: IgrsGame[]; meta: IgrsMeta; t: (key: string) => string }) {
  return (
    <div className={styles.recentlyViewedSection}>
      <div className={styles.recentlyViewedLabel}>
        {t('home.recentlyViewed')}
        <button type="button" className={styles.clearRecentBtn} onClick={clearRecentlyViewed}>{t('home.clearRecent')}</button>
      </div>
      <div className={styles.recentlyViewedList}>
        {games.map(game => {
          const ratingId = ratingIdsFromGame(game)[0] || null;
          return (
            <Link to={`/game/${game.id}`} className={styles.recentlyViewedItem} key={game.id}>
              <span className={styles.recentlyViewedName}>{game.name}</span>
              <span className={styles.recentlyViewedYear}>{game.releaseYear}</span>
              {ratingId ? <span className={styles.ratingBadge} data-rating={ratingId}>{ratingName(meta, ratingId)}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RecentlyRatedSection({ games, meta, t }: { games: IgrsGame[]; meta: IgrsMeta; t: (key: string) => string }) {
  if (games.length === 0) return null;
  return (
    <div className={styles.recentlyRatedSection}>
      <div className={styles.recentlyViewedLabel}>{t('home.recentlyRated')}</div>
      <div className={styles.recentlyViewedList}>
        {games.map(game => {
          const ratingId = ratingIdsFromGame(game)[0] || null;
          return (
            <Link to={`/game/${game.id}`} className={styles.recentlyViewedItem} key={game.id}>
              <span className={styles.recentlyViewedName}>{game.name}</span>
              <span className={styles.recentlyViewedYear}>{game.releaseYear}</span>
              {ratingId ? <span className={styles.ratingBadge} data-rating={ratingId}>{ratingName(meta, ratingId)}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RatingDistributionSection({ games, meta, t }: { games: IgrsGame[]; meta: IgrsMeta; t: (key: string) => string }) {
  const counts = new Map<number, number>();
  for (const game of games) {
    for (const rid of ratingIdsFromGame(game)) {
      counts.set(rid, (counts.get(rid) || 0) + 1);
    }
  }
  const entries = RATING_ORDER.filter(id => counts.has(id)).map(id => ({ id, count: counts.get(id)! }));
  const max = Math.max(...entries.map(e => e.count), 1);
  if (entries.length === 0) return null;
  return (
    <div className={styles.ratingDistribution}>
      <div className={styles.recentlyViewedLabel}>{t('ratings.distribution')}</div>
      {entries.map(({ id, count }) => (
        <div className={styles.ratingDistBar} key={id}>
          <span className={styles.ratingBadge} data-rating={id}>{ratingName(meta, id)}</span>
          <div className={styles.ratingDistFill} style={{ width: `${(count / max) * 100}%` }} />
          <span className={styles.ratingDistCount}>{count}</span>
        </div>
      ))}
    </div>
  );
}
