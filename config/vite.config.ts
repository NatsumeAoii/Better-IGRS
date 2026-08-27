import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const analyze = process.env.ANALYZE === 'true';
const configuredBasePath = process.env.VITE_BASE_PATH || './';

// Extract version from CHANGELOG.md at build time (just the version string).
// The full changelog content is imported via ?raw only in the lazy-loaded modal.
const changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
const changelogContent = readFileSync(changelogPath, 'utf-8');
const versionPattern = /^## \[([^\]]+)\]/gm;
let detectedVersion = '0.0.0';
let versionMatch: RegExpExecArray | null;
while ((versionMatch = versionPattern.exec(changelogContent)) !== null) {
  const v = versionMatch[1];
  if (v && v.toLowerCase() !== 'unreleased') {
    detectedVersion = v;
    break;
  }
}

if (detectedVersion === '0.0.0') {
  console.warn('[vite] Could not detect version from CHANGELOG.md, using 0.0.0');
}

const sourceRootUrl = new URL('../src/', import.meta.url);
const root = fileURLToPath(sourceRootUrl);
const htmlEntry = (relativePath: string) => fileURLToPath(new URL(relativePath, sourceRootUrl));

function hiddenPathGuard(): Plugin {
  return {
    name: 'igrs-hidden-path-guard',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
        if (pathname.startsWith('/@fs/')) {
          next();
          return;
        }

        const hasHiddenSegment = pathname
          .split(/[\\/]+/)
          .some(segment => segment.length > 1 && segment.startsWith('.'));

        if (!hasHiddenSegment) {
          next();
          return;
        }

        response.writeHead(403, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        });
        response.end('Forbidden');
      });
    }
  };
}

// Privacy-friendly Cloudflare Web Analytics beacon (cookieless, no PII).
// Injected into every HTML entry only when CF_BEACON_TOKEN is set, so dev
// servers and token-less CI builds stay clean. Enabling also requires
// allowing static.cloudflareinsights.com in the deployed CSP script-src.
function cloudflareBeacon(): Plugin {
  const token = process.env.CF_BEACON_TOKEN;
  return {
    name: 'igrs-cf-beacon',
    transformIndexHtml() {
      if (!token) return [];
      return [{
        tag: 'script',
        attrs: {
          defer: true,
          src: 'https://static.cloudflareinsights.com/beacon.min.js',
          'data-cf-beacon': JSON.stringify({ token })
        },
        injectTo: 'head'
      }];
    }
  };
}

export default defineConfig(async () => {
  const rollupPlugins = analyze
    ? [(await import('rollup-plugin-visualizer')).visualizer({
        filename: 'artifacts/bundle-report.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap'
      })]
    : [];

  return {
    base: configuredBasePath,
    define: {
      APP_VERSION: JSON.stringify(detectedVersion),
    },
    plugins: [
      hiddenPathGuard(),
      cloudflareBeacon(),
      react()
    ],
    publicDir: fileURLToPath(new URL('../public', import.meta.url)),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../src', import.meta.url))
      }
    },
    css: {
      transformer: 'lightningcss' as const
    },
    server: {
      fs: {
        strict: true,
        deny: ['**/.git/**', '**/.env', '**/.env.*']
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      cssMinify: 'lightningcss' as const,
      rollupOptions: {
        input: {
          app: htmlEntry('index.html'),
          fallback: htmlEntry('404.html'),
          ratings: htmlEntry('ratings/index.html'),
          search: htmlEntry('search/index.html'),
          steamchecker: htmlEntry('steamchecker/index.html')
        },
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router-dom/') ||
                id.includes('node_modules/lucide-react/') ||
                id.includes('node_modules/valibot/')) {
              return 'vendor';
            }
          }
        },
        plugins: rollupPlugins
      }
    },
    experimental: {
      // 404.html is the SPA fallback served at arbitrary unknown paths (e.g.
      // /game/123 by GitHub Pages directly, or re-served at /game/:id by the
      // preview Worker). Relative asset URLs would resolve against the request
      // path and 404, so this one entry gets root-absolute asset URLs.
      renderBuiltUrl(
        filename: string,
        { hostId, hostType }: { hostId: string; hostType: 'js' | 'css' | 'html' }
      ): string | undefined {
        if (hostType === 'html' && /(^|[\\/])404\.html$/.test(hostId)) {
          const assetPrefix = configuredBasePath === './'
            ? ''
            : configuredBasePath.replace(/\/$/, '');
          return `${assetPrefix}/${filename}`;
        }
        return undefined;
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      setupFiles: ['tests/setup.ts'],
      css: true,
      coverage: {
        provider: 'v8' as const,
        thresholds: {
          statements: 70,
          branches: 65,
          functions: 70,
          lines: 70,
        },
        reporter: ['text', 'lcov'],
      } as Record<string, unknown>,
    },
    root
  };
});
