import react from '@vitejs/plugin-react';
import { DEFAULT_BACKEND_PORT, HEALTH_PATH } from '@noot/shared';
import { defineConfig } from 'vitest/config';

const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${DEFAULT_BACKEND_PORT}`;

export default defineConfig({
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
});
