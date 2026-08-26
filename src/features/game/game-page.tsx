import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { usePageTitle } from '@/shared/hooks/use-page-title';
import { ErrorState } from '@/shared/components/data-state';
import { GameDetailSkeleton } from '@/shared/components/skeleton';
import { GameDetailView } from '@/shared/components/game-detail-view';
import { ratingName, ratingIdsFromGame, descriptorIdsFromGame, descriptorName } from '@/shared/lib/ratings';
import { recordRecentlyViewed } from '@/shared/hooks/use-recently-viewed';
import { useSteamMatch } from '@/shared/hooks/use-steam-match';
import { useSteamApi } from '@/shared/hooks/use-steam-api';
import styles from './game-page.module.css';

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { lang, t, unlocked } = useLanguage();
  const { data, error, loading, ensureData } = useRequiredIgrsData();

  // Shared lazy Steam API facade: one instance (and one match cache) is reused
  // across routes, so matches resolved here are peekable from search cards (#29).
  const steamApi = useSteamApi();

  const gameId = Number(id);
  const game = data?.gamesById.get(gameId) || null;
  const steamMatch = useSteamMatch(game, steamApi.findSteamMatchForGame);

  usePageTitle(
    game ? `${game.name} - IGRSDB` : 'Game - IGRSDB',
    game ? `${game.name} by ${game.publisherName} — IGRS rating and content descriptors.` : undefined
  );

  useEffect(() => {
    if (game) recordRecentlyViewed(game.id);
  }, [game]);

  useEffect(() => {
    if (!game || !data) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    const ratingId = ratingIdsFromGame(game)[0];
    const descriptorIds = descriptorIdsFromGame(game);
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      'name': game.name,
      'publisher': { '@type': 'Organization', 'name': game.publisherName },
      'datePublished': String(game.releaseYear),
      'contentRating': ratingId ? ratingName(data.meta, ratingId) : undefined,
      'genre': descriptorIds.map(id => descriptorName(data.meta, id, lang)),
    });
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [game, data, lang]);

  if (error) {
    return (
      <main className={styles.pageContainer} data-route-ready="game">
        <ErrorState title={t('data.error.title')} description={t('data.error.desc')} onRetry={() => void ensureData().catch(() => undefined)} retryLabel={t('retry')} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className={styles.pageContainer} data-route-ready="game">
        <GameDetailSkeleton label={t('aria.loadingGame')} />
      </main>
    );
  }

  if (!game) {
    return (
      <main className={styles.pageContainer} data-route-ready="game">
        <div className={`${styles.emptyState} ${styles.fadeIn}`}>
          <div className={styles.emptyStateTitle}>{t('fallback.notFound.title')}</div>
          <div className={styles.emptyStateDesc}>{t('page.gameNotFound').replace('{id}', String(id))}</div>
          <Link className={styles.searchLink} to="/search/">
            {t('fallback.search')}
          </Link>
        </div>
      </main>
    );
  }

  // Navigate by position in the dataset, not id arithmetic — game ids are not contiguous.
  const gameIndex = data.games.findIndex(g => g.id === game.id);
  const prevGame = gameIndex > 0 ? data.games[gameIndex - 1] : null;
  const nextGame = gameIndex >= 0 && gameIndex < data.games.length - 1 ? data.games[gameIndex + 1] : null;

  return (
    <main className={styles.pageContainer} data-route-ready="game">
      <nav className={styles.navRow}>
        <Link to="/search/" className={styles.breadcrumb}>{t('detail.backToSearch')}</Link>
        {prevGame || nextGame ? (
          <div className={styles.navButtons}>
            {prevGame ? (
              <Link className={styles.navButton} to={`/game/${prevGame.id}`} aria-label={t('detail.prevGame')}>
                <ChevronLeft className={styles.icon} aria-hidden="true" />
                <span>{t('detail.prevGame')}</span>
              </Link>
            ) : null}
            {nextGame ? (
              <Link className={styles.navButton} to={`/game/${nextGame.id}`} aria-label={t('detail.nextGame')}>
                <span>{t('detail.nextGame')}</span>
                <ChevronRight className={styles.icon} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </nav>
      <GameDetailView allGames={data.games} game={game} lang={lang} meta={data.meta} steamMatch={steamMatch} t={t} unlocked={unlocked} />
    </main>
  );
}
