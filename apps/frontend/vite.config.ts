import { defineConfig } from 'vitest/config';
import { createFrontendViteConfig } from './config/vite-env-dir.ts';

export default defineConfig(({ mode }) => createFrontendViteConfig(mode));
