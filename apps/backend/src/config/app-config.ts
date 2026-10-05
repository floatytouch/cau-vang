import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePort } from '../port.js';

const BACKEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_BRAINCORE_DATA_DIR = path.join(BACKEND_ROOT, 'data', 'braincore');
export const DEFAULT_IDENTITY_CONFIG_DIR = path.join(BACKEND_ROOT, 'config', 'braincore');
export const DEFAULT_LIVE_SESSION_CAP = 3;
export const DEFAULT_MAX_CHAT_TEXT_LENGTH = 100_000;

export interface BraincoreRuntimeConfig {
  dataDir: string;
  identityConfigDir: string;
  liveSessionCap: number;
  maxChatTextLength: number;
  mockEngines: boolean;
}

export interface AppConfig {
  port: number;
  braincore: BraincoreRuntimeConfig;
}

/** Sole place that reads process.env for Nest boot; feature code uses ConfigService. */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: resolvePort(env.PORT),
    braincore: {
      dataDir: resolvePath(
        env.NOOT_BRAINCORE_DATA_DIR,
        DEFAULT_BRAINCORE_DATA_DIR,
        'NOOT_BRAINCORE_DATA_DIR',
      ),
      identityConfigDir: resolvePath(
        env.NOOT_IDENTITY_CONFIG_DIR,
        DEFAULT_IDENTITY_CONFIG_DIR,
        'NOOT_IDENTITY_CONFIG_DIR',
      ),
      liveSessionCap: resolvePositiveInt(
        env.NOOT_BRAINCORE_LIVE_SESSION_CAP,
        DEFAULT_LIVE_SESSION_CAP,
        'NOOT_BRAINCORE_LIVE_SESSION_CAP',
      ),
      maxChatTextLength: resolvePositiveInt(
        env.NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH,
        DEFAULT_MAX_CHAT_TEXT_LENGTH,
        'NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH',
      ),
      mockEngines: env.NOOT_BRAINCORE_MOCK_ENGINES?.trim() === '1',
    },
  };
}

function resolvePath(raw: string | undefined, fallback: string, name: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return path.resolve(fallback);
  }
  if (trimmed.includes('\0')) {
    throw new Error(`${name} must not contain null bytes`);
  }
  return path.resolve(trimmed);
}

function resolvePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}
