import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.smoke.spec.ts'],
    environment: 'node',
  },
});
