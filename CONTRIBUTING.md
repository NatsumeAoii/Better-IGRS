# Contributing to Better-IGRS

First off, thank you for considering contributing to Better-IGRS!

## How Can I Contribute?

### Reporting Bugs
If you find a bug, please create an issue and include:
- A clear description of the problem
- Steps to reproduce the bug
- Expected behavior vs actual behavior
- Your environment (browser, OS, etc.)

### Suggesting Enhancements
Enhancement suggestions are welcome. Please provide a clear use case for the feature and explain how it improves the project.

### Pull Requests
1. Fork the repo and create your branch from `gh-pages` (the default branch — Pages deploys trigger on pushes to it).
2. If you've added code that should be tested, add tests.
3. Ensure the test suite passes (`npm test`).
4. Make sure your code lints (`npm run lint`).
5. Issue that pull request!

## Local Development

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Run checks before committing: `npm run check`

## Styleguides
- Use semantic HTML.
- Write tests for new logic.
- Document any new complex logic or architectural changes.

## Adding a New Language

1. Add the language code to the `Language` union in `src/shared/types.ts` (e.g., `'ja'`).
2. Add an entry to the `LANGUAGES` registry in `src/core/i18n-types.ts` with `code`, `name`, `dir` (`'ltr'` or `'rtl'`), and `dictionaryPath`.
3. Add a complete dictionary object in `src/core/i18n.ts` following the `en`/`id` pattern. The `TranslationDictionary` type enforces identical keys at compile time — a missing or extra key will cause a TypeScript error.
4. Create the external dictionary JSON at `public/assets/i18n/{lang}.json` (loaded at runtime by `src/core/i18n-loader.ts`).
5. Verify: `npm run typecheck` must pass with zero errors.

## Adding a New Route

1. Create a feature directory under `src/features/` (e.g., `src/features/newpage/`).
2. Add a lazy-loaded component and register the route in `src/app/App.tsx` using `React.lazy` + `Suspense`.
3. If the route needs a direct GitHub Pages deep-link path, add an HTML entry point (e.g., `src/newpage/index.html`) and register it in `config/vite.config.ts` → `build.rollupOptions.input`.
4. Add navigation links in the app shell if the route should be publicly reachable.
5. Verify: `npm run build` succeeds and the new chunk appears in `dist/assets/`.

## Running Tests

```bash
# All tests (unit, integration, property, performance, a11y, security, visual, structure)
npm test

# Full project check (lint + tests + build + structure checks)
npm run check

# Visual/responsive browser checks
npm run visual:check

# Coverage report
npx vitest --config config/vite.config.ts run --coverage
```

Test files live in `src/tests/` organized by category:

| Category | Directory | What it covers |
| --- | --- | --- |
| Unit | `src/tests/unit/` | Pure functions, hooks, utilities |
| Integration | `src/tests/integration/` | Component rendering, data flow |
| Property-based | `src/tests/property/` | Invariant checks via `fast-check` |
| Performance | `src/tests/performance/` | Timing budgets for hot paths |
| Accessibility | `src/tests/a11y/` | axe-core automated checks |
| Security | `src/tests/security/` | XSS vectors, input sanitization |
| Visual | `src/tests/visual/` | Layout and responsive checks |
| Structure | `src/tests/structure/` | Stack, dependency, and config validation |

## Data Refresh Pipeline

The scheduled workflow `.github/workflows/update-igrs-db.yml` keeps game data current:

1. Fetches all games from the IGRS public API in parallel batches (15 concurrent, chunked by ID range).
2. Retries failed IDs once to recover from transient errors.
3. Fetches ratings and descriptors metadata from dedicated endpoints.
4. Normalizes platform names and transforms data with `jq` into three JSON files (`igrs.games.json`, `igrs.meta.json`, `igrs.extra.json`).
5. Runs the project test suite against the refreshed data.
6. Validates integrity — fails if game count drops more than 10%.
7. Commits and pushes changes if files differ.
8. On failure, creates a GitHub issue with the workflow run link and failed step name.

The workflow runs daily at midnight UTC and can be triggered manually via `workflow_dispatch`.

Thanks again for your support and contributions!
