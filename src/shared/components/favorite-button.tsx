/**
 * Favorite toggle button — shared by game cards and the game detail view.
 *
 * A real `<button>` with an accessible pressed state (`aria-pressed`) and the
 * Lucide `Star` icon, backed by the shared favorites store so every mounted
 * instance stays in sync. Only the pressed state changes visually; the state
 * is never conveyed by color alone (the icon fills and the label changes).
 */
import { Star } from 'lucide-react';
import { memo } from 'react';
import { useFavorites } from '@/shared/hooks/use-favorites';

export interface FavoriteButtonProps {
  gameId: number;
  t: (key: string) => string;
}

export const FavoriteButton = memo(function FavoriteButton({ gameId, t }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(gameId);
  const label = active ? t('favorites.remove') : t('favorites.add');

  return (
    <button
      type="button"
      className={`favorite-toggle${active ? ' favorite-toggle--active' : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => toggleFavorite(gameId)}
    >
      <Star size={16} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
});
