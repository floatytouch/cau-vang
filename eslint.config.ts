import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint law for NV-11. Naming and nested-ternary must fail closed.
 * Broader typescript-eslint strict rules (explicit-module-boundary-types,
 * no-floating-promises, typed no-magic-numbers) are documented in
 * docs/code-conventions/ and land once packages have type-aware lint projects.
 */
export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '.yarn/**', '.worktrees/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-nested-ternary': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          modifiers: ['const', 'exported'],
          format: ['UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
      ],
    },
  },
  {
    files: ['apps/frontend/src/**/*.tsx', 'apps/frontend/src/**/*.ts', 'apps/frontend/test/**/*.tsx'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: [
      '**/test/**/*.{ts,tsx}',
      '**/*.{spec,test}.{ts,tsx}',
      'eslint.config.ts',
      'scripts/**/*.{js,mjs,cjs,ts}',
    ],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  prettierConfig,
);
