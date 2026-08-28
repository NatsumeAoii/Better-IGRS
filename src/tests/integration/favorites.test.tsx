import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesPage } from '@/features/favorites/favorites-page';
import { GameCard } from '@/features/search/search-results';

const games = [
  {
    id: 1,
    name: 'Alpha Game',
    publisherName: 'North Studio',
    releaseYear: 2024,
    ratings: [7],
    descriptors: [3],
    platforms: [1],
  },
  {
    id: 2,
    name: 'Beta Game',
    publisherName: 'South Studio',
    releaseYear: 2023,
    ratings: [6],
    descriptors: [10],
    platforms: [2],
  },
];

const meta = {
  meta: { generatedAt: '2026-01-01T00:00:00Z', totalGames: 2 },
  ratings: {
    7: { name: 'SU', titleEn: 'Everyone', titleId: 'Semua Umur', weight: 1 },
    6: { name: '18+', titleEn: 'Adults', titleId: 'Dewasa', weight: 5 },
  },
  descriptors: {
    3: { nameEn: 'Violence', nameId: 'Kekerasan' },
    10: { nameEn: 'Online Interaction', nameId: 'Interaksi Daring' },
  },
  platforms: { 1: 'PC', 2: 'Nintendo Switch' },
};

vi.mock('@/app/providers/language-provider', () => ({
  useLanguage: () => ({
    lang: 'en',
    t: (key: string) => key,
    toggleLanguage: vi.fn(),
    setLang: vi.fn(),
    unlocked: false,
    dictionaryLoading: false,
  }),
}));

vi.mock('@/app/providers/data-provider', () => ({
  useRequiredIgrsData: () => ({
    data: {
      games,
      gamesById: new Map(games.map(game => [game.id, game])),
      gamesByNormalizedName: new Map(games.map(game => [game.name.toLowerCase(), game])),
      meta,
      steamMeta: { contentDescriptors: {} },
      stats: { publisherCount: 2, platformCount: 2 },
    },
    error: null,
    loading: false,
    ensureData: vi.fn(),
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

describe('FavoritesPage (plan 4.1)', () => {
  it('resolves stored ids through gamesById and silently omits stale ids', () => {
    window.localStorage.setItem('igrs:favorites', JSON.stringify([1, 999]));

    render(
      <MemoryRouter initialEntries={['/favorites/']}>
        <FavoritesPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Alpha Game')).toBeInTheDocument();
    expect(screen.queryByText('Beta Game')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('favorites.count');
  });

  it('renders a localized empty state with a next action when nothing is favorited', () => {
    render(
      <MemoryRouter initialEntries={['/favorites/']}>
        <FavoritesPage />
      </MemoryRouter>
    );

    expect(screen.getByText('favorites.empty.title')).toBeInTheDocument();
    expect(screen.getByText('favorites.empty.desc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'favorites.empty.action' })).toHaveAttribute('href', '/search/');
  });

  it('keeps the favorites page and a mounted card in sync through the shared store', () => {
    window.localStorage.setItem('igrs:favorites', JSON.stringify([1]));

    render(
      <MemoryRouter initialEntries={['/favorites/']}>
        <FavoritesPage />
        <GameCard game={games[0] as never} lang="en" meta={meta as never} publisherQuery="" query="" t={(key: string) => key} />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Alpha Game')).toHaveLength(2); // page card + standalone card

    // Removing the favorite from the card must immediately empty the page.
    // Both mounted cards (page + standalone) expose the same toggle.
    fireEvent.click(screen.getAllByRole('button', { name: 'favorites.remove' })[0] as HTMLElement);

    expect(screen.getByText('favorites.empty.title')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Game')).toHaveLength(1); // only the standalone card remains
    expect(window.localStorage.getItem('igrs:favorites')).toBeNull();
  });
});

describe('FavoriteButton on game cards (plan 4.1)', () => {
  it('toggles the pressed state and persists the id to igrs:favorites', () => {
    render(
      <MemoryRouter>
        <GameCard game={games[0] as never} lang="en" meta={meta as never} publisherQuery="" query="" t={(key: string) => key} />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: 'favorites.add' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'favorites.remove' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('igrs:favorites') ?? '[]')).toEqual([1]);

    fireEvent.click(screen.getByRole('button', { name: 'favorites.remove' }));
    expect(screen.getByRole('button', { name: 'favorites.add' })).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('igrs:favorites')).toBeNull();
  });
});
