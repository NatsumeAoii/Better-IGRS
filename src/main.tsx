import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { APP_BASE_PATH } from '@/core/constants';
import './styles/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    {/* App-level boundary: any uncaught render error shows a fallback
        with a full-reload recovery instead of a blank white screen */}
    <ErrorBoundary
      fallback={() => (
        <div className="error-boundary-fallback" role="alert">
          <h2>Something went wrong</h2>
          <p>The page could not be rendered safely. Reload the page to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Service worker registration must never block or break app boot — failures
// are swallowed; kill switch is reverting this registration (see public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = APP_BASE_PATH === '/' ? '/sw.js' : `${APP_BASE_PATH}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => undefined);
  });
}
