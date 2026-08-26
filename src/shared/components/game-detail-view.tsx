import { Check, Copy, Search, User } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IGRS_LOGO_URL } from '@/core/constants';
import { safeHttpUrl } from '@/core/safe-render';
import { DescriptorIcons } from '@/shared/components/descriptor-icons';
import { RatingBadge } from '@/shared/components/rating-badge';
import { copyTextToClipboard } from '@/shared/lib/clipboard';
import { descriptorIdsFromGame, ratingIdsFromGame, ratingName, ratingTitle } from '@/shared/lib/ratings';
import { platformIdsFromGame, platformName } from '@/shared/lib/platforms';
import { findRelatedGames } from '@/shared/lib/related-games';
import { formatExtraField } from '@/shared/lib/extra-field';
import type { IgrsGame, IgrsMeta, SteamSearchResult } from '@/shared/types';

interface GameDetailViewProps {
  /** All games in the dataset — used to compute related games */
  allGames?: IgrsGame[];
  game: IgrsGame;
  lang: 'en' | 'id';
  meta: IgrsMeta;
  steamMatch: SteamSearchResult | null;
  t: (key: string) => string;
  /** Developer unlock — reveals the raw data inspector outside dev mode (#34) */
  unlocked?: boolean;
}

export function GameDetailView({ allGames, game, lang, meta, steamMatch, t, unlocked }: GameDetailViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ratingId = ratingIdsFromGame(game)[0] || null;
  const ratingIds = ratingIdsFromGame(game);
  const descriptorIds = descriptorIdsFromGame(game);
  const platformText = platformIdsFromGame(meta, game).map(id => platformName(meta, id, lang)).join(', ');
  const video = formatExtraField(game.videoUrl, t('detail.linksPatched'));
  const inGame = formatExtraField(game.inGameUrl, t('detail.linksPatched'));

  const relatedGames = useMemo(() => {
    if (!allGames) return [];
    // Scoring considers shared descriptors + publisher + year proximity
    return findRelatedGames(game, allGames);
  }, [game, allGames]);

  const copyShareUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: game.name, url: window.location.href });
      } catch { /* user cancelled */ }
    } else if (await copyTextToClipboard(`${window.location.origin}/game/${game.id}`)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyGameId = async () => {
    if (await copyTextToClipboard(String(game.id))) {
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const isLong = (game.description || '').length > 300;
  const displayText = isLong && !expanded ? game.description!.slice(0, 300) + '...' : (game.description || t('detail.noDesc'));
  // Item #33: flag entries missing descriptors and/or platforms as incomplete.
  const dataIncomplete = !game.descriptors?.length || !game.platforms?.length;
  const steamCoverAppId = steamMatch?.status === 'match' ? steamMatch.match.appId : null;

  return (
    <div className="detail-card fade-in">
      {steamCoverAppId ? <SteamCoverImage appId={steamCoverAppId} /> : null}
      <div className="detail-header">
        <div>
          <div className="detail-title">{game.name}</div>
          <Link to={`/search/?publisher=${encodeURIComponent(game.publisherName)}`} className="detail-publisher">
            {game.publisherName}
          </Link>
          {dataIncomplete && <span className="detail-incomplete-badge">{t('detail.dataIncomplete')}</span>}
        </div>
        {ratingId ? <span className="rating-badge" data-rating={ratingId}>{ratingName(meta, ratingId)}</span> : null}
      </div>
      <p className="detail-description">
        {displayText}
        {isLong && (
          <button type="button" className="detail-toggle-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? t('detail.showLess') : t('detail.showMore')}
          </button>
        )}
      </p>
      <div className="detail-grid">
        <DetailRow label={t('detail.year')}>
          {game.releaseYear}
          {game.releaseYear > new Date().getFullYear() && <span className="detail-upcoming-badge">{t('detail.upcoming')}</span>}
        </DetailRow>
        <DetailRow label={t('detail.platforms')}>{platformText || '-'}</DetailRow>
        <DetailRow label={t('detail.rating')}>{ratingIds.map(id => ratingTitle(meta, id, lang)).join(', ') || '-'}</DetailRow>
        <DetailRow label={t('detail.descriptors')}>
          <DescriptorIcons ids={descriptorIds} emptyLabel={t('detail.noDescriptors')} lang={lang} meta={meta} />
        </DetailRow>
        <DetailRow label={t('detail.igrsId')}>
          <button type="button" className="detail-id-copy" onClick={() => void copyGameId()} title={t('detail.copyId')}>
            {copiedId ? <Check className="ui-icon" aria-hidden="true" /> : <Copy className="ui-icon" aria-hidden="true" />}
            <span>{game.id}</span>
            <span className="sr-only">{t('detail.copyId')}</span>
          </button>
          <span aria-live="polite" className="sr-only">{copiedId ? t('detail.copied') : ''}</span>
        </DetailRow>
        {video ? <DetailLinkRow label={t('detail.video')} value={video} /> : null}
        {inGame ? <DetailLinkRow label={t('detail.ingame')} value={inGame} /> : null}
      </div>
      <div className="detail-actions">
        <button className={`detail-share-btn${copied ? ' copied' : ''}`} type="button" onClick={copyShareUrl}>
          {copied ? <Check className="ui-icon" aria-hidden="true" /> : <Copy className="ui-icon" aria-hidden="true" />}
          <span>{copied ? t('detail.copied') : t('detail.share')}</span>
        </button>
        <span aria-live="polite" className="sr-only">{copied ? t('detail.copied') : ''}</span>
        <Link className="detail-link-btn" to={`/search/?publisher=${encodeURIComponent(game.publisherName)}`}>
          <User className="ui-icon" aria-hidden="true" />
          <span>{t('detail.viewPublisher').replace('{publisher}', game.publisherName)}</span>
        </Link>
        <a className="detail-link-btn" href={`https://igrs.id/game-detail/${game.id}`} target="_blank" rel="noopener noreferrer">
          <img src={IGRS_LOGO_URL} alt="" aria-hidden="true" />
          <span>{t('detail.openIgrs')}</span>
        </a>
        <a className="detail-link-btn" href={`https://www.google.com/search?q=${encodeURIComponent(`${game.name} ${t('steamchecker.by')} ${game.publisherName}`)}`} target="_blank" rel="noopener noreferrer">
          <Search className="ui-icon" aria-hidden="true" />
          <span>{t('detail.searchGoogle')}</span>
        </a>
      </div>
      <SteamMatchPanel result={steamMatch} t={t} />
      {relatedGames.length > 0 && (
        <RelatedGamesSection games={relatedGames} meta={meta} t={t} />
      )}
      {(import.meta.env.DEV || unlocked) && (
        <details className="detail-raw-data">
          <summary>{t('detail.rawData')}</summary>
          <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '400px', padding: '1rem', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
            {JSON.stringify(game, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Progressive enhancement (#32): when a Steam match is known, show the game's
 * Steam header artwork. Hidden automatically if the CDN request fails.
 */
function SteamCoverImage({ appId }: { appId: string }) {
  const [failed, setFailed] = useState(false);
  const url = safeHttpUrl(`https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(appId)}/header.jpg`);
  if (failed || !url) return null;
  return (
    <img
      className="detail-steam-cover"
      src={url.href}
      alt=""
      loading="lazy"
      width={460}
      height={215}
      onError={() => setFailed(true)}
    />
  );
}

function DetailRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </>
  );
}

function DetailLinkRow({ label, value }: { label: string; value: string }) {
  const url = safeHttpUrl(value);
  return (
    <DetailRow label={label}>
      {url ? <a href={url.href} target="_blank" rel="noopener noreferrer">{url.href}</a> : value}
    </DetailRow>
  );
}

function RelatedGamesSection({ games, meta, t }: { games: IgrsGame[]; meta: IgrsMeta; t: (key: string) => string }) {
  return (
    <div className="related-games-section">
      <h3 className="related-games-title">{t('detail.relatedGames')}</h3>
      <div className="related-games-grid">
        {games.map(game => {
          const gameRatingId = game.ratings?.[0] ?? null;
          return (
            <Link className="related-game-card" key={game.id} to={`/game/${game.id}`}>
              <RatingBadge className="related-game-rating-img" meta={meta} ratingId={gameRatingId} />
              <span className="related-game-name">{game.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SteamMatchPanel({ result, t }: { result: SteamSearchResult | null; t: (key: string) => string }) {
  if (!result) {
    return (
      <div className="detail-steam-match" aria-live="polite">
        <div className="steam-match-panel steam-match-panel-muted">
          <div className="loading-spinner" />
          <div>
            <div className="steam-match-title">{t('detail.steamLookup.title')}</div>
            <div className="steam-match-status">{t('detail.steamLookup.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (result.status === 'match' && result.match) {
    return (
      <div className="detail-steam-match" aria-live="polite">
        <div className="steam-match-panel">
          <div>
            <div className="steam-match-title">{t('detail.steamLookup.title')}</div>
            <div className="steam-match-status">{t('detail.steamLookup.found')}</div>
            <div className="steam-match-name">{result.match.name}</div>
            <div className="steam-match-meta">App ID {result.match.appId}</div>
          </div>
          <Link className="detail-link-btn" to={`/steamchecker/?appid=${encodeURIComponent(result.match.appId)}`}>{t('detail.steamLookup.check')}</Link>
        </div>
      </div>
    );
  }

  if (result.status === 'ambiguous' && result.candidates.length) {
    return (
      <div className="detail-steam-match" aria-live="polite">
        <div className="steam-match-panel">
          <div>
            <div className="steam-match-title">{t('detail.steamLookup.title')}</div>
            <div className="steam-match-status">{t('detail.steamLookup.possible')}</div>
            <div className="steam-match-meta">{t('detail.steamLookup.choose')}</div>
          </div>
          <div className="steam-match-options">
            {result.candidates.map(candidate => (
              <Link className="detail-link-btn" to={`/steamchecker/?appid=${encodeURIComponent(candidate.appId)}`} key={candidate.appId}>
                <span>{candidate.name}</span>
                <span className="steam-match-appid">{candidate.appId}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-steam-match" aria-live="polite">
      <div className="steam-match-panel steam-match-panel-muted">
        <div>
          <div className="steam-match-title">{t('detail.steamLookup.title')}</div>
          <div className="steam-match-status">{t('detail.steamLookup.notFound')}</div>
        </div>
      </div>
    </div>
  );
}
