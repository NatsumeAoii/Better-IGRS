import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/app/providers/theme-provider';
import * as browserStorage from '@/shared/lib/browser-storage';

vi.mock('@/shared/lib/browser-storage');

function ThemeProbe() {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={toggleTheme}>toggle</button>
      <button type="button" onClick={() => setTheme('system')}>system</button>
      <button type="button" onClick={() => setTheme('dark')}>dark</button>
      <button type="button" onClick={() => setTheme('light')}>light</button>
    </div>
  );
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.mocked(browserStorage.readLocalStorage).mockReturnValue(null);
  vi.mocked(browserStorage.writeLocalStorage).mockReturnValue(true);
  vi.mocked(browserStorage.removeLocalStorage).mockReturnValue(true);
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('renders children correctly', () => {
    render(
      <ThemeProvider>
        <div>child content</div>
      </ThemeProvider>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('initial theme from localStorage resolves to dark', () => {
    vi.mocked(browserStorage.readLocalStorage).mockReturnValue('dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('detects system preference via matchMedia', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('toggleTheme cycles between light and dark', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    const initial = screen.getByTestId('resolved').textContent;
    const toggle = screen.getByRole('button', { name: 'toggle' });

    fireEvent.click(toggle);
    const afterFirst = screen.getByTestId('resolved').textContent;
    expect(afterFirst).not.toBe(initial);

    fireEvent.click(toggle);
    const afterSecond = screen.getByTestId('resolved').textContent;
    expect(afterSecond).toBe(initial);
  });

  it('setTheme("system") removes localStorage entry', () => {
    vi.mocked(browserStorage.readLocalStorage).mockReturnValue('dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme').textContent).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'system' }));

    expect(vi.mocked(browserStorage.removeLocalStorage)).toHaveBeenCalledWith('igrs-theme');
    expect(screen.getByTestId('theme').textContent).toBe('system');
  });

  it('data-theme attribute is set on document.documentElement', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    const resolved = screen.getByTestId('resolved').textContent;
    expect(document.documentElement.getAttribute('data-theme')).toBe(resolved);

    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
