import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const eslintConfig = [
// Global ignores - replaces .eslintignore
{
  ignores: [
    // Build outputs
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/.vercel/**',
    '**/.astro/**',
    '**/storybook-static/**',

    // Dependencies
    '**/node_modules/**',

    // Generated files
    '**/coverage/**',
    '**/*.tsbuildinfo',
    '**/*.d.ts',

    // Lock files
    '**/pnpm-lock.yaml',
    '**/package-lock.json',
    '**/yarn.lock',

    // Environment files
    '**/.env*',

    // IDE files
    '**/.vscode/**',
    '**/.idea/**',
    '**/.vscode-root/**',
    '**/.cursor/**',
    '**/.cursor-root/**',
    '**/~/**',
    '~/.**',

    // OS files
    '**/.DS_Store',
    '**/Thumbs.db',

    // Logs
    '**/logs/**',
    '**/*.log',

    // Temporary files
    '**/tmp/**',
    '**/temp/**',

    // Backup files
    '*.backup.*',
    'app.backup.*/**',
    '**/backup/**',

    // Wrangler
    '**/.wrangler/**',

    // Test results
    '**/test-results/**',
    '**/playwright-report/**',
    '**/tests/e2e/generated-docs/**',

    // Visual snapshots
    '**/visual-snapshots/**',

    // Supabase
    '**/supabase/.branches/**',
    '**/supabase/.temp/**',

    // Archive directory - historical files, not linted
    '.archive/**',

    // Other system files
    '**/bin/**',
    '**/snap/**',
    'altamedica-reboot-clone/**',
    'altamedica-reboot-deploy/**',
    'Devaltamedica-Independent/**',
    'grok-cli/**',
    'nginx/**',
    'openai-cli-venv/**',
    'patients-deploy/**',
    'scripts/test-fixtures/**/*.snapshot.ts',
  ],
},
js.configs.recommended,
{
  files: ['**/*.{ts,tsx,mts,cts}'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      project: true,
    },
    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.es2021,
      React: 'readonly',
      JSX: 'readonly',
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
    'unused-imports': unusedImports,
  },
  rules: {
    // Disable base rule in favor of TypeScript version
    'no-undef': 'off',

    // Prohibir deep imports
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@autamedica/*/src/*'],
            message: 'Deep imports are not allowed. Use package main exports instead.',
          },
        ],
      },
    ],

    // Prohibir process.env directo fuera de @autamedica/shared
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Use ensureEnv from @autamedica/shared instead of direct process.env access.',
      },
    ],

    // Prohibir export * (debe usar barrels controlados)
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ExportAllDeclaration',
        message: 'export * prohibido. Usa barrels controlados con exports nombrados.',
      },
    ],

    // Manejo de imports no usados
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ],

    // TypeScript estricto
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off', // Deshabilitado en favor de unused-imports
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'error',
  },
},
// Package-specific parser configuration overrides
{
  files: ['packages/shared/**/*.{ts,tsx}'],
  languageOptions: {
    parserOptions: {
      project: ['./packages/shared/tsconfig.eslint.json'],
    },
  },
},
{
  files: ['packages/telemedicine/**/*.{ts,tsx}'],
  languageOptions: {
    parserOptions: {
      project: ['./packages/telemedicine/tsconfig.eslint.json'],
    },
  },
},
// JavaScript files configuration
{
  files: ['**/*.{js,mjs,cjs}'],
  languageOptions: {
    globals: {
      ...globals.node,
      ...globals.es2021,
      ...globals.browser,
    },
  },
  rules: {
    'no-unused-vars': ['error', {
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none'
    }],
  },
},
// Allow process.env in specific packages and files
{
  files: [
    'packages/shared/**/*.{ts,tsx}',
    'packages/auth/**/*.{ts,tsx}',
    '**/lib/supabase*.{ts,tsx}',
    '**/lib/env.{ts,tsx}',
    '**/lib/monitoring.{ts,tsx}',
    '**/middleware/**/*.{ts,tsx}',
    '**/e2e/**/*.{ts,tsx}',
    '**/oauth-handler.{ts,tsx}',
    '**/components/auth/**/*.{ts,tsx}',
    '**/components/layout/VSCodeLayout.{ts,tsx}',
    'apps/web/src/components/ErrorBoundary.tsx',
    'apps/clinical-ai-orchestrator/**/*.{ts,tsx}',
    'apps/signaling-server/**/*.{ts,tsx}',
    'apps/mobile/**/*.{ts,tsx}',
    'packages/telemedicine/**/*.{ts,tsx}',
  ],
  rules: {
    'no-restricted-properties': 'off',
  },
},
{
  files: [
    '**/*.config.{ts,mts}',
    '**/middleware.{ts,mts}',
    '**/tsup.config.{ts,mts}',
    '**/vitest.config.{ts,mts}',
    '**/vitest.config.example.{ts,mts}',
    'worker/**/*.{ts,mts}',
  ],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      project: false,
    },
    globals: {
      ...globals.node,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: {
    'no-restricted-properties': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-useless-escape': 'off',
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'unused-imports/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'off',
  },
},
// JavaScript configuration files
{
  files: [
    '**/*.config.{js,mjs,cjs}',
    '**/scripts/**/*.{js,mjs,cjs,ts,mts}',
    '**/.dependency-cruiser.{js,cjs,mjs}',
  ],
  rules: {
    'no-restricted-properties': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-useless-escape': 'off',
  },
},
// Test files
{
  files: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}', '**/tests/**/*.{ts,tsx,js,jsx}', 'packages/**/__tests__/**/*.{ts,tsx,js,jsx}', 'packages/**/vitest.setup.ts'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      project: false
    },
    globals: {
      ...globals.jest,
      ...globals.mocha,
      ...globals.browser,
      ...globals.node,
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    'no-restricted-properties': 'off',
    'no-useless-escape': 'off',
  },
},
// Script files (shell scripts, supabase, tests, worker)
{
  files: ['tests/**', 'worker/**', 'scripts/**', 'supabase/**'],
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      project: false
    }
  },
  plugins: {
    '@typescript-eslint': tseslint,
    'unused-imports': unusedImports,
  },
  rules: {
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    'no-empty': 'warn',
    'no-case-declarations': 'warn',
    'no-misleading-character-class': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-unsafe-declaration-merging': 'warn',
    'no-restricted-properties': 'off',
    'no-restricted-syntax': 'off',
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ],
    'no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ]
  }
},
// Script .js files
{
  files: ['**/scripts/**/*.{js,mjs,cjs}'],
  rules: {
    'no-unused-vars': ['warn', {
      args: 'none',
      varsIgnorePattern: '^_|^fs$|^path$',
      caughtErrors: 'none'
    }],
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
},
// Observability files
{
  files: ['**/observability/**/*.{js,mjs,ts}'],
  languageOptions: {
    parser: tsparser,
    globals: {
      ...globals.node,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
    'unused-imports': unusedImports,
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ],
  },
}];

export default eslintConfig;
