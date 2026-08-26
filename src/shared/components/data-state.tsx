import { AlertTriangle, LoaderCircle } from 'lucide-react';

interface LoadingStateProps {
  label: string;
}

interface ErrorStateProps {
  description: string;
  title: string;
  /** When provided, renders a retry button that invokes this callback */
  onRetry?: () => void;
  retryLabel?: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <LoaderCircle className="ui-icon loading-spinner" aria-hidden="true" />
      <div>{label}</div>
    </div>
  );
}

export function ErrorState({ description, title, onRetry, retryLabel }: ErrorStateProps) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-state-icon">
        <AlertTriangle className="empty-state-svg" aria-hidden="true" />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{description}</div>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </button>
      ) : null}
    </div>
  );
}
