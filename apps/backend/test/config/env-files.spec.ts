import 'reflect-metadata';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_BACKEND_PORT,
  NODE_ENV_DEVELOPMENT,
  NODE_ENV_PRODUCTION,
  NODE_ENV_STAGING,
} from '@noot/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/app-config.js';
import {
  createConfigModuleOptions,
  ENV_FILE_DEFAULT,
  ENV_FILE_DEVELOPMENT,
  resolveEnvFilePaths,
  shouldIgnoreEnvFile,
} from '../../src/config/env-files.js';

const MANAGED_ENV_KEYS = ['PORT', 'NOOT_WS_TOKEN', 'NOOT_BRAINCORE_MOCK_ENGINES'] as const;

describe('env file loading policy', () => {
  it('ignores env files unless NODE_ENV is development', () => {
    expect(shouldIgnoreEnvFile(NODE_ENV_DEVELOPMENT)).toBe(false);
    expect(shouldIgnoreEnvFile('Development')).toBe(false);
    expect(shouldIgnoreEnvFile(NODE_ENV_PRODUCTION)).toBe(true);
    expect(shouldIgnoreEnvFile(NODE_ENV_STAGING)).toBe(true);
    expect(shouldIgnoreEnvFile('test')).toBe(true);
    expect(shouldIgnoreEnvFile(undefined)).toBe(true);
  });

  it('lists the development env file before the default env file', () => {
    const repoRoot = '/tmp/noot-repo-root';
    expect(resolveEnvFilePaths(repoRoot)).toEqual([
      path.join(repoRoot, ENV_FILE_DEVELOPMENT),
      path.join(repoRoot, ENV_FILE_DEFAULT),
    ]);
  });

  it('sets ConfigModule ignoreEnvFile and does not override process env', () => {
    const production = createConfigModuleOptions(NODE_ENV_PRODUCTION, '/tmp/a');
    expect(production.ignoreEnvFile).toBe(true);
    expect(production.override).toBe(false);

    const unset = createConfigModuleOptions(undefined, '/tmp/a');
    expect(unset.ignoreEnvFile).toBe(true);

    const staging = createConfigModuleOptions(NODE_ENV_STAGING, '/tmp/a');
    expect(staging.ignoreEnvFile).toBe(true);

    const development = createConfigModuleOptions(NODE_ENV_DEVELOPMENT, '/tmp/a');
    expect(development.ignoreEnvFile).toBe(false);
    expect(development.override).toBe(false);
  });
});

describe('ConfigModule envFilePath loading', () => {
  const snapshots: Array<{ key: string; value: string | undefined }> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    restoreManagedEnv(snapshots);
    snapshots.length = 0;
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('loads file values when process env is unset', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, [
      'PORT=4121',
      'NOOT_BRAINCORE_MOCK_ENGINES=1',
      'NOOT_WS_TOKEN=file-token',
    ]);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);

    const config = await bootAppConfig(repoRoot, NODE_ENV_DEVELOPMENT);
    expect(config.port).toBe(4121);
    expect(config.wsToken).toBe('file-token');
    expect(config.braincore.mockEngines).toBe(true);
  });

  it('lets process env override file values', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, [
      'PORT=4121',
      'NOOT_BRAINCORE_MOCK_ENGINES=1',
      'NOOT_WS_TOKEN=file-token',
    ]);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);
    process.env.PORT = '4333';
    process.env.NOOT_WS_TOKEN = 'process-token';
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '0';

    const config = await bootAppConfig(repoRoot, NODE_ENV_DEVELOPMENT);
    expect(config.port).toBe(4333);
    expect(config.wsToken).toBe('process-token');
    expect(config.braincore.mockEngines).toBe(false);
  });

  it('does not read env files in production', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, [
      'PORT=4121',
      'NOOT_BRAINCORE_MOCK_ENGINES=1',
      'NOOT_WS_TOKEN=file-token',
    ]);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';

    const config = await bootAppConfig(repoRoot, NODE_ENV_PRODUCTION);
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.wsToken).toBeUndefined();
  });

  it('does not read env files when NODE_ENV is unset', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, [
      'PORT=4121',
      'NOOT_BRAINCORE_MOCK_ENGINES=1',
      'NOOT_WS_TOKEN=file-token',
    ]);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';

    const config = await bootAppConfig(repoRoot, undefined);
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.wsToken).toBeUndefined();
  });

  it('does not read env files in staging', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, [
      'PORT=4121',
      'NOOT_BRAINCORE_MOCK_ENGINES=1',
      'NOOT_WS_TOKEN=file-token',
    ]);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';

    const config = await bootAppConfig(repoRoot, NODE_ENV_STAGING);
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.wsToken).toBeUndefined();
  });

  it('does not crash when env files are missing and process env is complete', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';

    const config = await bootAppConfig(repoRoot, NODE_ENV_DEVELOPMENT);
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.braincore.mockEngines).toBe(true);
  });

  it('lets .env.development override .env for keys absent from the process', async () => {
    const repoRoot = makeRepoRoot(tempDirs);
    writeEnv(repoRoot, ENV_FILE_DEFAULT, ['PORT=4121', 'NOOT_BRAINCORE_MOCK_ENGINES=1']);
    writeEnv(repoRoot, ENV_FILE_DEVELOPMENT, ['PORT=4242']);
    rememberKeys(snapshots, MANAGED_ENV_KEYS);
    deleteManaged(MANAGED_ENV_KEYS);

    const config = await bootAppConfig(repoRoot, NODE_ENV_DEVELOPMENT);
    expect(config.port).toBe(4242);
  });
});

async function bootAppConfig(repoRoot: string, nodeEnv: string | undefined): Promise<AppConfig> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(createConfigModuleOptions(nodeEnv, repoRoot))],
  }).compile();
  const config = moduleRef.get(ConfigService);
  return {
    port: config.getOrThrow<number>('port'),
    wsToken: config.get<string | undefined>('wsToken'),
    braincore: config.getOrThrow('braincore'),
  };
}

function makeRepoRoot(tempDirs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noot-env-'));
  tempDirs.push(dir);
  return dir;
}

function writeEnv(repoRoot: string, fileName: string, lines: string[]): void {
  fs.writeFileSync(path.join(repoRoot, fileName), `${lines.join('\n')}\n`);
}

function rememberKeys(
  snapshots: Array<{ key: string; value: string | undefined }>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    snapshots.push({ key, value: process.env[key] });
  }
}

function deleteManaged(keys: readonly string[]): void {
  for (const key of keys) {
    delete process.env[key];
  }
}

function restoreManagedEnv(snapshots: Array<{ key: string; value: string | undefined }>): void {
  for (const { key, value } of snapshots) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
