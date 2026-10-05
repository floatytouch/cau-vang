import { describe, expect, it } from 'vitest';
import {
  resolveViteBackendUrl,
  resolveViteEnvDir,
  VITE_MODE_PRODUCTION,
  VITE_PRODUCTION_SKIP_ENV_SEGMENTS,
} from '../../src/config/vite-env-dir.js';

describe('resolveViteEnvDir', () => {
  const repoRoot = '/tmp/noot-frontend-root';

  it('loads repo-root env files in non-production modes', () => {
    expect(resolveViteEnvDir('development', repoRoot)).toBe(repoRoot);
    expect(resolveViteEnvDir('test', repoRoot)).toBe(repoRoot);
  });

  it('does not point at the repo-root .env directory in production', () => {
    const productionDir = resolveViteEnvDir(VITE_MODE_PRODUCTION, repoRoot);
    expect(productionDir).not.toBe(repoRoot);
    expect(productionDir).toBe(`${repoRoot}/${VITE_PRODUCTION_SKIP_ENV_SEGMENTS.join('/')}`);
  });
});

describe('resolveViteBackendUrl', () => {
  const fallback = 'http://localhost:3000';

  it('lets process env override the env file', () => {
    expect(resolveViteBackendUrl('http://127.0.0.1:9', 'http://from-file:1', fallback)).toBe(
      'http://127.0.0.1:9',
    );
  });

  it('uses the file value when process env is unset', () => {
    expect(resolveViteBackendUrl(undefined, 'http://from-file:1', fallback)).toBe(
      'http://from-file:1',
    );
  });

  it('falls back when both sources are missing', () => {
    expect(resolveViteBackendUrl(undefined, undefined, fallback)).toBe(fallback);
  });
});
