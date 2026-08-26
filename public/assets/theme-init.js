/* Better-IGRS theme bootstrap — must run before first paint to avoid a
   light/dark flash (FOUC) for users with a stored or system dark preference.

   Resolution logic mirrors src/app/providers/theme-provider.tsx:
   - localStorage 'igrs-theme' = 'light' | 'dark' (explicit choice), or
   - system preference via prefers-color-scheme when no explicit choice.
   Also aligns the theme-color meta with the resolved theme pre-paint.

   Loaded as a classic (non-module) script so it executes synchronously.
   Kept in a separate file (not inline) to stay compatible with the strict
   Content-Security-Policy (`script-src 'self'`) documented in public/_headers. */
(function () {
  try {
    var stored = null;
    try {
      stored = window.localStorage.getItem('igrs-theme');
    } catch {
      stored = null;
    }
    var dark =
      stored === 'dark' ||
      (stored !== 'light' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var resolved = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#ffffff');
  } catch {
    /* Never block rendering over theme bootstrap. */
  }
})();
