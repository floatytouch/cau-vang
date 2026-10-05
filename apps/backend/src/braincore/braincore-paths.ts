import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_BRAINCORE_DATA_DIR = path.join(BACKEND_ROOT, 'data', 'braincore');

export const DEFAULT_IDENTITY_CONFIG_DIR = path.join(BACKEND_ROOT, 'config', 'braincore');

export function resolveBraincoreDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.NOOT_BRAINCORE_DATA_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(DEFAULT_BRAINCORE_DATA_DIR);
}

export function resolveIdentityConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.NOOT_IDENTITY_CONFIG_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(DEFAULT_IDENTITY_CONFIG_DIR);
}
