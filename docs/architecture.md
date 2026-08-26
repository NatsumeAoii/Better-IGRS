# Architecture

Better-IGRS is a static single-page application (Vite 8, React 19, TypeScript) that
publishes an unofficial browsable snapshot of the Indonesian Game Rating System
(IGRS) registry. There is no application backend: all game data ships as JSON
files next to the app, search runs client-side in a Web Worker, and two small
Cloudflare Workers cover the gaps that pure static hosting cannot.

## System overview

```text
┌─────────────────────┐       ┌──────────────────┐
│  Browser (SPA)      │──────▶│  GitHub Pages    │
│  Vite + React + TS  │ fetch │  Static artifact │
│  Web Worker (search)│       │  HTML/JS/CSS/JSON│
│  Service Worker     │       └──────────────────┘
└─────────┬───────────▲                ▲
          │           └────────────────┘
          │ /proxy/steam/*            │ /game/:id
          ▼                           │
┌─────────────────────────────────────────────────┐
│  Cloudflare Worker (ops/worker)                 │
│  - /game/:id   social-bot previews + SPA shell  │
│  - /proxy/steam/*  allowlisted Steam API proxy  │
└───────────────────┬─────────────────────────────┘
                    │ GET https://store.steampowered.com (allowlisted)
                    ▼
```

## Deployment topology

Two independent deploy surfaces make up production:

1. **SPA — GitHub Pages artifact deploy** (`.github/workflows/pages.yml`).
   A push to the default branch (`gh-pages`) runs `npm run check`, builds
   `dist/`, uploads it with `actions/upload-pages-artifact@v5`, and deploys it
   with `actions/deploy-pages@v5`. Pages serves *either* an uploaded artifact
   or a branch root, never both — this repo is artifact-mode only. Root-level
   copies of build outputs are deliberately absent (and gitignored); the custom
   domain marker ships as `public/CNAME` so it lands inside `dist/`.
2. **Worker — Cloudflare** (`ops/worker`, deployed separately via Wrangler).
   Routes `igrs.madeby.my.id/game/*` and `igrs.madeby.my.id/proxy/steam/*`
   (plus `staging-igrs.madeby.my.id` equivalents). The Worker is stateless and
   reads its data from the live site over HTTPS.

Because both surfaces serve the same domain, the browser sees one origin: same-origin
fetches are covered by CSP `connect-src 'self'` with no extra exceptions.

## Request and data flow

### First load

1. GitHub Pages serves one of five HTML entries (`index.html`, `404.html`,
   `ratings/index.html`, `search/index.html`, `steamchecker/index.html`) — see
   "Multiple HTML entries" below.
2. Hashed JS/CSS chunks load (`Cache-Control: public, max-age=31536000,
   immutable` policy), React mounts, and the data provider fetches:
   - `/assets/data/json/igrs.meta.json` — ratings/descriptors/platforms metadata
   - `/assets/data/json/igrs.games.json` — game entries (~600 rows)
   - `/assets/data/json/steam.meta.json` — Steam descriptor mapping tables
   - `/assets/data/json/igrs.extra.json` — optional media URLs (loaded on demand)
3. Payloads are validated at the boundary with valibot before entering app
   state; invalid data fails into the existing error states rather than
   rendering unvalidated content.
4. `src/core/search-index.worker.ts` builds an in-memory normalized index
   (pre-normalized strings, Set-based O(1) filter checks, fuzzy matching,
   faceted counts).

### Offline behavior

A hand-rolled service worker (`public/sw.js`, no dependency) keeps the app
usable offline:

| Request kind | Strategy |
| --- | --- |
| Navigations (HTML) | Network-first → last-good cached HTML of same path → cached `404.html` shell |
| Content-hashed assets | Cache-first (immutable by filename) |
| Unhashed mutable assets (e.g. `theme-init.js`) | Stale-while-revalidate |
| `/assets/data/json/*`, `/assets/i18n/*` | Stale-while-revalidate (fresh daily data still works offline) |
| `/proxy/steam/*`, cross-origin, non-GET | Bypassed entirely — Steam Checker keeps its own online error UX |

An offline banner (`src/shared/components/offline-banner.tsx`) appears while
`navigator.onLine` is false. Registration in `src/main.tsx` is PROD-gated,
feature-detected, and failure-tolerant; removing the registration reverts the
feature, and setting the SW's `VERSION` to `'off'` makes already-installed
workers unregister themselves on next visit.

### Game detail deep links (`/game/:id`)

GitHub Pages cannot rewrite arbitrary paths to the SPA, so unknown paths fall
back to `404.html`, which is a full copy of the app entry using root-absolute
asset URLs (Vite `experimental.renderBuiltUrl` override for that entry only).
The preview Worker improves on this:

- **Social bots** get server-rendered HTML with Open Graph/oEmbed metadata built
  from the same public JSON files (cached 300 s in module scope, escaped output).
- **Browsers** get the origin's `404.html` re-served with status 200 plus strict
  security headers (`script-src 'self'`, `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`), so React renders the game page directly without a
  redirect loop. If the shell fetch fails, the Worker falls back to a legacy
  `/search/#id` redirect.

### Steam Checker proxy chain

Steam store endpoints have no CORS headers, so browser calls need a proxy. The
client (`src/shared/api/steam-api.ts`) keeps an ordered proxy base list:

1. Same-origin Worker route `/proxy/steam/` (primary). To override it with
   `VITE_STEAM_PROXY_BASE`, also set `VITE_STEAM_PROXY_MODE=path` for another
   Worker-style path-forwarding proxy; omit the mode for a legacy full-URL CORS
   proxy.
2. Legacy third-party CORS proxy `https://cors.mefi.workers.dev/` (fallback).

On network-level failure of a whole proxy the client advances to the next base
with its per-base retry budget, capped at four total attempts; user aborts
always propagate immediately. Cache keys stay query/appId-based regardless of
which proxy served the result.

The Worker's `/proxy/steam/*` handler is **not** an open relay:

- Upstream host is hardcoded to `https://store.steampowered.com`.
- Only paths matching `^/(api|appreviews)/` pass — exactly the prefixes the
  checker produces (`/api/storesearch`, `/api/appdetails`, `/appreviews/{id}`);
  dot-segments, encoded traversal, backslashes, and malformed escapes are rejected.
- GET-only (405 otherwise); query string forwarded verbatim; responses are
  JSON-only with `nosniff`; upstream failures map to a generic no-store 502.
- Server-side Cache API with `max-age=300` absorbs repeat lookups and respects
  Steam rate limits; clients receive `max-age=60`.

## Data pipeline contract

`.github/workflows/update-igrs-db.yml` refreshes the dataset daily from the
IGRS public API and commits three files to `public/assets/data/json/`
(see workflow header comments for the full transformation spec):

| File | Shape |
| --- | --- |
| `igrs.games.json` | `[{ id, name, releaseYear, publisherName, description?, ratings: number[], descriptors: number[], platforms: number[] }]` sorted newest-first |
| `igrs.meta.json` | `{ meta: { generatedAt, totalGames }, ratings, descriptors, platforms }` keyed by string ID |
| `igrs.extra.json` | `[{ id, videoUrl?, inGameUrl? }]` — only entries with at least one URL |

Integrity gates: refreshed data must pass `npm test`, and the game count may not
drop more than 10% versus the previous commit. Failures open an issue
automatically. Data changes propagate to users through the daily push → Pages
build; the service worker's stale-while-revalidate keeps previously seen data
available offline while refreshing in the background.

## Key decisions (encoded elsewhere in comments)

- **Multiple HTML entries** — each routable path has a real HTML file so GitHub
  Pages serves deep links directly with no server-side rewriting
  (`config/vite.config.ts` rollup inputs; rationale also in README Q&A).
- **Root-absolute assets for `404.html` only** — the fallback shell can be
  served at any depth, so relative asset URLs would break there;
  `experimental.renderBuiltUrl` scopes this to that single entry.
- **Worker SPA-shell pass-through instead of redirect** — browsers land on the
  real URL with a 200 and full headers; bots get rich previews; the loop risk
  is avoided because the shell is fetched from a non-routed path.
- **Hand-rolled service worker** — ~150 lines with no dependency; if strategies
  grow beyond the table above, adopt Workbox or the Vite PWA plugin.
- **Artifact-only Pages deploy** — branch-root sync tooling was removed; the
  deployed artifact is the single source of truth.
