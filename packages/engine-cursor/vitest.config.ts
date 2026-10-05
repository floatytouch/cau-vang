import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.smoke.spec.ts'],
    environment: 'node',
  },
});
