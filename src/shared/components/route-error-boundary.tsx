import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface RouteErrorBoundaryProps {
  children: ReactNode;
  t?: (key: string) => string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary designed for lazy-loaded route chunks.
 * Catches chunk loading failures and provides a reliable retry mechanism.
 * Failed React.lazy imports are cached as rejected promises, so chunk errors
 * require a full reload to fetch the current asset manifest again.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[RouteErrorBoundary] Chunk load failed:', error, errorInfo.componentStack);
  }

  handleRetry = (): void => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <ChunkErrorFallback error={error} onRetry={this.handleRetry} t={this.props.t} />;
    }
    return this.props.children;
  }
}

function ChunkErrorFallback({ error, onRetry, t }: { error: Error; onRetry: () => void; t?: (key: string) => string }) {
  const isChunkError = isChunkLoadError(error);

  return (
    <div className="route-error-fallback" role="alert">
      <div className="route-error-icon">
        <AlertTriangle className="route-error-svg" aria-hidden="true" />
      </div>
      <h2 className="route-error-title">{t?.('error.pageLoadFailed') ?? 'Page could not be loaded'}</h2>
      <p className="route-error-desc">
        {isChunkError
          ? (t?.('error.networkChunkError') ?? 'A network error occurred while loading this page. Please check your connection and try again.')
          : (t?.('error.safeDescription') ?? 'The page could not be loaded safely. Try again or reload the page.')}
      </p>
      <button type="button" className="route-error-retry" onClick={onRetry}>
        <RefreshCw className="route-error-retry-icon" aria-hidden="true" />
        {t?.('error.retry') ?? 'Retry'}
      </button>
    </div>
  );
}

/** Detects chunk/module loading errors from dynamic imports */
function isChunkLoadError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('loading chunk') ||
    message.includes('loading css chunk') ||
    message.includes('dynamically imported module') ||
    message.includes('failed to fetch')
  );
}
