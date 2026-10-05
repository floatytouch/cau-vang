import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { DEFAULT_BACKEND_PORT, HEALTH_PATH, shouldLoadEnvFiles } from '@noot/shared';
import { loadEnv } from 'vite';
import type { ViteUserConfig } from 'vitest/config';

const FRONTEND_CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));

export const FRONTEND_REPO_ROOT = path.resolve(FRONTEND_CONFIG_DIR, '..', '..', '..');

export function resolveViteEnvDir(mode: string, repoRoot: string): string | false {
  if (shouldLoadEnvFiles(mode)) {
    return repoRoot;
  }
  return false;
}

export function resolveViteBackendUrl(
  processBackendUrl: string | undefined,
  fileBackendUrl: string | undefined,
  fallback: string,
): string {
  return processBackendUrl ?? fileBackendUrl ?? fallback;
}

export function createFrontendViteConfig(mode: string): ViteUserConfig {
  const envDir = resolveViteEnvDir(mode, FRONTEND_REPO_ROOT);
  const fileEnv = loadEnv(mode, envDir, '');
  const backendUrl = resolveViteBackendUrl(
    process.env.BACKEND_URL,
    fileEnv.BACKEND_URL,
    `http://localhost:${DEFAULT_BACKEND_PORT}`,
  );

  return {
    envDir,
    plugins: [react()],
    server: {
      proxy: {
        [HEALTH_PATH]: backendUrl,
        '/socket.io': { target: backendUrl, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.tsx', 'test/**/*.test.ts'],
    },
  };
}
