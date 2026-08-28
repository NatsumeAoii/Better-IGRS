/**
 * Favorites Page — lists the user's favorited games.
 *
 * Stored IDs are resolved through `gamesById`; IDs that no longer exist in a
 * refreshed dataset are silently omitted (plan 4.1). Empty, loading, and
 * error states are localized.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useLanguage } from '@/app/providers/language-provider';
import { useRequiredIgrsData } from '@/app/providers/data-provider';
import { ErrorState, LoadingState } from '@/shared/components/data-state';
import { GameCard } from '@/features/search/search-results';
import { useFavorites } from '@/shared/hooks/use-favorites';
import { usePageTitle } from '@/shared/hooks/use-page-title';
import type { IgrsGame } from '@/shared/types';

export function FavoritesPage() {
  const { lang, t } = useLanguage();
  const { data, error, loading } = useRequiredIgrsData();
  const { favorites } = useFavorites();

  // Canonical per-route handled by usePageTitle.
  usePageTitle('Favorites - IGRSDB', 'Your favorited games in the unofficial IGRS database.');

  // Resolve stored IDs to games through gamesById (O(1) per id). Stale IDs
  // that no longer exist in the dataset are omitted silently.
  const favoriteGames = useMemo(() => {
    if (!data) return [];
    const resolved: IgrsGame[] = [];
    for (const id of favorites) {
      const game = data.gamesById.get(id);
      if (game) resolved.push(game);
    }
    return resolved;
  }, [data, favorites]);

  if (error) {
    return (
      <main className="app-layout" data-route-ready="favorites">
        <div className="main-content">
          <ErrorState
            title={t('data.error.title')}
            description={t('data.error.desc')}
          />
        </div>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className="app-layout" data-route-ready="favorites">
        <div className="main-content">
          <LoadingState label={t('loading')} />
        </div>
      </main>
    );
  }

  if (favoriteGames.length === 0) {
    return (
      <main className="app-layout" data-route-ready="favorites">
        <div className="main-content">
          <div className="favorites-page">
            <h1 className="favorites-page-title">{t('favorites.title')}</h1>
            <div className="empty-state favorites-empty">
              <Star className="empty-state-svg favorites-empty-star" aria-hidden="true" />
              <div className="empty-state-title">{t('favorites.empty.title')}</div>
              <div className="empty-state-desc">{t('favorites.empty.desc')}</div>
              <Link to="/search/" className="btn favorites-empty-action">
                {t('favorites.empty.action')}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-layout" data-route-ready="favorites">
      <div className="main-content">
        <div className="favorites-page">
          <h1 className="favorites-page-title">
            {t('favorites.count').replace('{count}', String(favoriteGames.length))}
          </h1>
          <div className="favorites-grid">
            {favoriteGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                lang={lang}
                meta={data.meta}
                publisherQuery=""
                query=""
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

