import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DataProvider } from '@/app/providers/data-provider';
import { LanguageProvider, useLanguage } from '@/app/providers/language-provider';
import { ThemeProvider } from '@/app/providers/theme-provider';
import { APP_BASE_PATH } from '@/core/constants';
import { NotFoundPage } from '@/features/fallback/not-found-page';
import { HomePage } from '@/features/home/home-page';
import { SearchPage } from '@/features/search/search-page';
import { AppShell } from '@/shared/components/app-shell';
import { LoadingState } from '@/shared/components/data-state';
import { RouteErrorBoundary } from '@/shared/components/route-error-boundary';

function LocalizedRouteErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return <RouteErrorBoundary t={t}>{children}</RouteErrorBoundary>;
}

// Reset scroll position on route change (UX standard — prevents disorientation)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const RatingsPage = lazy(() =>
  import('@/features/ratings/ratings-page').then((m) => ({ default: m.RatingsPage }))
);
const SteamCheckerPage = lazy(() =>
  import('@/features/steam-checker/steam-checker-page').then((m) => ({ default: m.SteamCheckerPage }))
);
const GamePage = lazy(() =>
  import('@/features/game/game-page').then((m) => ({ default: m.GamePage }))
);

export function App() {
  const routerBasename = APP_BASE_PATH === '/' ? undefined : APP_BASE_PATH;

  return (
    <BrowserRouter basename={routerBasename}>
      <ScrollToTop />
      <ThemeProvider>
        <LanguageProvider>
          <DataProvider>
            <AppShell>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search/" element={<SearchPage />} />
                <Route
                  path="/game/:id"
                  element={
                    <LocalizedRouteErrorBoundary>
                      <Suspense fallback={<LoadingState label="Loading…" />}>
                        <GamePage />
                      </Suspense>
                    </LocalizedRouteErrorBoundary>
                  }
                />
                <Route
                  path="/ratings/"
                  element={
                    <LocalizedRouteErrorBoundary>
                      <Suspense fallback={<LoadingState label="Loading…" />}>
                        <RatingsPage />
                      </Suspense>
                    </LocalizedRouteErrorBoundary>
                  }
                />
                <Route
                  path="/steamchecker/"
                  element={
                    <LocalizedRouteErrorBoundary>
                      <Suspense fallback={<LoadingState label="Loading…" />}>
                        <SteamCheckerPage />
                      </Suspense>
                    </LocalizedRouteErrorBoundary>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppShell>
          </DataProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
