import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameDetailView } from '@/shared/components/game-detail-view';

const game = {
  id: 7,
  name: 'Share Target',
  publisherName: 'Studio',
  releaseYear: 2024,
  description: 'A game description.',
  ratings: [7],
  descriptors: [3],
  platforms: [1],
};

const meta = {
  meta: { generatedAt: '2026-01-01T00:00:00Z', totalGames: 1 },
  ratings: { 7: { name: 'SU', titleEn: 'Everyone', titleId: 'Semua Umur', weight: 1 } },
  descriptors: { 3: { nameEn: 'Violence', nameId: 'Kekerasan' } },
  platforms: { 1: 'PC' },
};

function renderView() {
  return render(
    <MemoryRouter>
      <GameDetailView game={game as never} lang="en" meta={meta as never} steamMatch={null} t={(key: string) => key} />
    </MemoryRouter>
  );
}

function stubShare(value: unknown): void {
  Object.defineProperty(navigator, 'share', { value, configurable: true, writable: true });
}

/** jsdom reports isSecureContext=false, which disables the async-clipboard
 *  path in copyTextToClipboard — stub it to exercise the real code path. */
function stubSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true, writable: true });
}

afterEach(() => {
  // Restore the global setup.ts share mock.
  stubShare(vi.fn().mockResolvedValue(undefined));
  stubSecureContext(true);
  vi.restoreAllMocks();
});

describe('share/copy reliability (plan 1.2)', () => {
  it('uses Web Share with the canonical game URL on success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'detail.share' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0]).toMatchObject({ title: 'Share Target', url: expect.stringContaining('/game/7') });
    expect(screen.queryByText('detail.copyFailed')).not.toBeInTheDocument();
  });

  it('treats a user-initiated share cancellation as a silent no-op', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('user closed sheet', 'AbortError'));
    stubShare(share);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'detail.share' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    // Give any (incorrect) fallback a chance to run.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('detail.copyFailed')).not.toBeInTheDocument();

    writeText.mockRestore();
  });

  it('falls back to the clipboard and announces success when Web Share is unavailable', async () => {
    stubShare(undefined);
    stubSecureContext(true);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'detail.share' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('/game/7');
    // Share button flips to its copied state (label + live region both render it).
    expect(screen.getAllByText('detail.copied').length).toBeGreaterThan(0);

    writeText.mockRestore();
  });

  it('shows an inline localized failure message when copying is blocked', async () => {
    stubShare(undefined);
    stubSecureContext(true);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    // The execCommand fallback also fails: jsdom has no execCommand, so
    // copyWithTextarea returns false — exactly the blocked-everywhere case.

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'detail.share' }));

    await waitFor(() => expect(screen.getAllByText('detail.copyFailed').length).toBeGreaterThan(0));

    writeText.mockRestore();
  });
});
