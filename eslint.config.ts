import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          modifiers: ['destructured'],
          format: null,
        },
        {
          selector: 'variable',
          modifiers: ['const', 'exported'],
          format: ['UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
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
    files: [
      'apps/frontend/src/**/*.tsx',
      'apps/frontend/src/**/*.ts',
      'apps/frontend/test/**/*.tsx',
      'apps/frontend/test/**/*.ts',
    ],
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
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  prettierConfig,
);
