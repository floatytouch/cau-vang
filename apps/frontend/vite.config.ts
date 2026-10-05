import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { DEFAULT_BACKEND_PORT, HEALTH_PATH } from '@noot/shared';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveViteBackendUrl, resolveViteEnvDir } from './src/config/vite-env-dir.ts';

const FRONTEND_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig(({ mode }) => {
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
});
