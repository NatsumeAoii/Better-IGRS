const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const tseslint = require('typescript-eslint');

const tsFiles = ['src/**/*.{ts,tsx}', 'config/*.ts'];

module.exports = tseslint.config(
  {
    ignores: [
      'dist',
      'assets',
      'node_modules',
      '.worktree',
      'artifacts',
      'coverage',
      'public/assets/data/json/*.json'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: tsFiles
  })),
  {
    files: tsFiles,
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    files: ['config/*.config.js', 'ops/scripts/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', 'src/tests/**/*.js', 'ops/worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        fetch: 'readonly'
      }
    }
  },
  {
    // Browser-context classic scripts shipped as-is from public/ (e.g. the
    // pre-paint theme bootstrap). Not bundled, so keep browser globals.
    files: ['public/assets/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // Hand-rolled service worker: classic script running in the SW global
    // scope (self/caches/fetch), not a module — lint it with worker globals.
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.serviceworker
      }
    }
  }
);
