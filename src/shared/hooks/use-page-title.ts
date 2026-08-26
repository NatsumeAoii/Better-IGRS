import { useEffect } from 'react';

/**
 * Hook to manage document head metadata when the route changes.
 * Updates document.title and, when provided, the meta description,
 * canonical link, and basic Open Graph/Twitter tags so SPA navigation
 * keeps per-page metadata accurate for sharing and SEO.
 * Automatically restores previous values on unmount.
 *
 * @param title - The new page title to set
 * @param description - Optional meta description for the page
 */
export function usePageTitle(title: string, description?: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    const prevDescription = getMeta('meta[name="description"]');

    document.title = title;
    if (description !== undefined) {
      setMeta('meta[name="description"]', 'content', description);
      setMeta('meta[property="og:title"]', 'content', title);
      setMeta('meta[property="og:description"]', 'content', description);
      setMeta('meta[name="twitter:title"]', 'content', title);
      setMeta('meta[name="twitter:description"]', 'content', description);
    }

    // Keep the canonical URL + og:url in sync with the current route
    // (excluding query/hash so filtered searches collapse to the canonical page).
    const routeUrl = window.location.origin + window.location.pathname;
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', routeUrl);
    }
    setMeta('meta[property="og:url"]', 'content', routeUrl);

    return () => {
      document.title = prevTitle;
      if (description !== undefined && prevDescription !== null) {
        setMeta('meta[name="description"]', 'content', prevDescription);
      }
    };
  }, [title, description]);
}

function getMeta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

function setMeta(selector: string, attr: string, value: string): void {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}
