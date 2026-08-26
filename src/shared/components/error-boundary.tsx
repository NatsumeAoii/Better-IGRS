import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Callback type for error reporting integration.
 * Receives the caught error and the React component stack string.
 * Implementations can forward to any external service (Sentry, Datadog, custom endpoint, etc.).
 */
export type ErrorReporter = (error: Error, componentStack: string) => void;

interface ErrorBoundaryProps {
  /** Custom fallback UI. Receives error and reset function. */
  fallback?: (props: { error: Error; resetError: () => void }) => ReactNode;
  /**
   * Injectable error reporting callback invoked when a rendering error is caught.
   * When provided, this replaces the default console.error fallback — the reporter
   * is fully responsible for logging/reporting the error.
   * When omitted, errors are logged to console.error as a fallback.
   */
  onError?: ErrorReporter;
  /** Optional translation function for localized fallback strings */
  t?: (key: string) => string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const componentStack = errorInfo.componentStack ?? '';

    if (this.props.onError) {
      this.props.onError(error, componentStack);
    } else {
      console.error('[ErrorBoundary]', error, componentStack);
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, resetError: this.resetError });
      }
      return <DefaultErrorFallback resetError={this.resetError} t={this.props.t} />;
    }
    return this.props.children;
  }
}

// ponytail: class component has no access to LanguageProvider context;
// static English strings acceptable for error fallback.
// Upgrade to render-prop or forwardRef wrapper when third language is added.
function DefaultErrorFallback({ resetError, t }: { resetError: () => void; t?: (key: string) => string }) {
  return (
    <div className="error-boundary-fallback" role="alert">
      <h2>{t?.('error.somethingWrong') ?? 'Something went wrong'}</h2>
      <p>{t?.('error.safeDescription') ?? 'The page could not be rendered safely. Try again or reload the page.'}</p>
      <button type="button" onClick={resetError}>{t?.('error.tryAgain') ?? 'Try again'}</button>
    </div>
  );
}
