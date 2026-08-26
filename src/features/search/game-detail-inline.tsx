import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import type { createSteamApi } from '@/shared/api/steam-api';
import { GameDetailView } from '@/shared/components/game-detail-view';
import { recordRecentlyViewed } from '@/shared/hooks/use-recently-viewed';
import { useSteamMatch } from '@/shared/hooks/use-steam-match';
import type { IgrsGame, IgrsMeta } from '@/shared/types';
import pageStyles from './search-page.module.css';

interface GameDetailInlineProps {
  /** All games in the dataset — used for related games and prev/next navigation */
  allGames?: IgrsGame[];
  game: IgrsGame;
  lang: 'en' | 'id';
  meta: IgrsMeta;
  onBack: () => void;
  /** Opens another game in the inline panel (used by prev/next navigation) */
  onNavigate?: (id: number) => void;
  steamApi: ReturnType<typeof createSteamApi>;
  t: (key: string) => string;
  /** Developer unlock — forwarded to GameDetailView (#34) */
  unlocked?: boolean;
}

export function GameDetailInline({ allGames, game, lang, meta, onBack, onNavigate, steamApi, t, unlocked }: GameDetailInlineProps) {
  const steamMatch = useSteamMatch(game, steamApi.findSteamMatchForGame);

  useEffect(() => {
    recordRecentlyViewed(game.id);
  }, [game.id]);

  // Navigate by position in the dataset, not id arithmetic — game ids are not
  // contiguous. Mirrors the standalone game page behavior (#14).
  const gameIndex = allGames ? allGames.findIndex(g => g.id === game.id) : -1;
  const prevGame = allGames && gameIndex > 0 ? allGames[gameIndex - 1] : null;
  const nextGame = allGames && gameIndex >= 0 && gameIndex < allGames.length - 1 ? allGames[gameIndex + 1] : null;

  return (
    <>
      <div className={pageStyles.detailNavRow}>
        <button className={pageStyles.detailBack} type="button" onClick={onBack}>
          <ChevronLeft className="ui-icon" aria-hidden="true" />
          {t('detail.back')}
        </button>
        {onNavigate && (prevGame || nextGame) ? (
          <div className={pageStyles.detailNavButtons}>
            {prevGame ? (
              <button className={pageStyles.detailNavButton} type="button" onClick={() => onNavigate(prevGame.id)} aria-label={t('detail.prevGame')}>
                <ChevronLeft className="ui-icon" aria-hidden="true" />
                <span>{t('detail.prevGame')}</span>
              </button>
            ) : null}
            {nextGame ? (
              <button className={pageStyles.detailNavButton} type="button" onClick={() => onNavigate(nextGame.id)} aria-label={t('detail.nextGame')}>
                <span>{t('detail.nextGame')}</span>
                <ChevronRight className="ui-icon" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <GameDetailView allGames={allGames} game={game} lang={lang} meta={meta} steamMatch={steamMatch} t={t} unlocked={unlocked} />
    </>
  );
}
