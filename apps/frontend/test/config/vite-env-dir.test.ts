import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NODE_ENV_DEVELOPMENT, NODE_ENV_PRODUCTION, NODE_ENV_STAGING } from '@noot/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from 'vite';
import {
  createFrontendViteConfig,
  FRONTEND_REPO_ROOT,
  resolveViteBackendUrl,
  resolveViteEnvDir,
} from '../../config/vite-env-dir.js';

const VITE_CANARY_TOKEN = 'LEAKCANARY_VITE_TOKEN';
const VITE_CANARY_KEY = 'VITE_NOOT_WS_TOKEN';

describe('resolveViteEnvDir', () => {
  const repoRoot = '/tmp/noot-frontend-root';

  it('loads repo-root env files only in development mode', () => {
    expect(resolveViteEnvDir(NODE_ENV_DEVELOPMENT, repoRoot)).toBe(repoRoot);
    expect(resolveViteEnvDir('Development', repoRoot)).toBe(repoRoot);
  });

  it('disables env files for production, staging, test, and empty mode', () => {
    expect(resolveViteEnvDir(NODE_ENV_PRODUCTION, repoRoot)).toBe(false);
    expect(resolveViteEnvDir('Production', repoRoot)).toBe(false);
    expect(resolveViteEnvDir(NODE_ENV_STAGING, repoRoot)).toBe(false);
    expect(resolveViteEnvDir('test', repoRoot)).toBe(false);
    expect(resolveViteEnvDir('', repoRoot)).toBe(false);
  });
});

describe('Vite envDir used by the config factory', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('does not surface a planted VITE_ token outside development', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noot-vite-env-'));
    tempDirs.push(repoRoot);
    fs.writeFileSync(path.join(repoRoot, '.env'), `${VITE_CANARY_KEY}=${VITE_CANARY_TOKEN}\n`);

    const blockedModes = [NODE_ENV_PRODUCTION, NODE_ENV_STAGING, 'test', 'Production', ''];
    for (const mode of blockedModes) {
      const envDir = resolveViteEnvDir(mode, repoRoot);
      const loaded = loadEnv(mode, envDir, '');
      expect(envDir).toBe(false);
      expect(loaded[VITE_CANARY_KEY]).not.toBe(VITE_CANARY_TOKEN);
    }

    const developmentDir = resolveViteEnvDir(NODE_ENV_DEVELOPMENT, repoRoot);
    expect(developmentDir).toBe(repoRoot);
    expect(loadEnv(NODE_ENV_DEVELOPMENT, developmentDir, '')[VITE_CANARY_KEY]).toBe(
      VITE_CANARY_TOKEN,
    );
  });

  it('pins the exported Vite config to skip env files in production and staging', () => {
    expect(createFrontendViteConfig(NODE_ENV_PRODUCTION).envDir).toBe(false);
    expect(createFrontendViteConfig(NODE_ENV_STAGING).envDir).toBe(false);
    expect(createFrontendViteConfig(NODE_ENV_DEVELOPMENT).envDir).toBe(FRONTEND_REPO_ROOT);
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
