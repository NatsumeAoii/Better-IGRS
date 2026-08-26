import { useEffect, useState } from 'react';
import { useLanguage } from '@/app/providers/language-provider';

/**
 * Announces offline status. Data comes from the SW-cached JSON, so the app
 * keeps working with saved data while offline; the Steam Checker has its own
 * error states and does not depend on this banner.
 */
export function OfflineBanner() {
  const { t } = useLanguage();
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;
  return <div className="offline-banner" role="status">{t('app.offlineBanner')}</div>;
}
