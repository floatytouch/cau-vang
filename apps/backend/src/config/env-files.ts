import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigModuleOptions } from '@nestjs/config';
import { loadAppConfig } from './app-config.js';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(CONFIG_DIR, '..', '..', '..', '..');
export const NODE_ENV_PRODUCTION = 'production';
export const ENV_FILE_DEFAULT = '.env';
export const ENV_FILE_DEVELOPMENT = '.env.development';

export function shouldIgnoreEnvFile(nodeEnv: string | undefined): boolean {
  return nodeEnv === NODE_ENV_PRODUCTION;
}

export function resolveEnvFilePaths(repoRoot: string): string[] {
  return [path.join(repoRoot, ENV_FILE_DEVELOPMENT), path.join(repoRoot, ENV_FILE_DEFAULT)];
}

export function createConfigModuleOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  repoRoot: string = REPO_ROOT,
): ConfigModuleOptions {
  return {
    isGlobal: true,
    ignoreEnvFile: shouldIgnoreEnvFile(nodeEnv),
    envFilePath: resolveEnvFilePaths(repoRoot),
    override: false,
    load: [() => loadAppConfig(process.env)],
  };
}
