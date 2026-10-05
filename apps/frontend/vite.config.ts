import { defineConfig } from 'vitest/config';
import { createFrontendViteConfig } from './config/vite-config.ts';

export default defineConfig(({ mode }) => createFrontendViteConfig(mode));
