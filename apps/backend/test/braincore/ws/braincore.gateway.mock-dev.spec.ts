import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WS_SUBSCRIBE_SESSION_EVENT } from '@noot/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { RawSocketIoClient } from '../../../src/braincore/testing/raw-socket-io-client.js';

const ENV_KEYS = [
  'NOOT_BRAINCORE_DATA_DIR',
  'NOOT_BRAINCORE_MOCK_ENGINES',
  'NOOT_WS_TOKEN',
] as const;

describe('BraincoreGateway in mock-engine dev mode without NOOT_WS_TOKEN', () => {
  let app: INestApplication;
  let dataDir: string;
  const savedEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-mock-dev-gateway-'));
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    process.env.NOOT_BRAINCORE_DATA_DIR = dataDir;
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';
    delete process.env.NOOT_WS_TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  it('keeps the tokenless local dev connect working', async () => {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const client = RawSocketIoClient.open(port);
    await client.ready;
    expect(await client.emit(WS_SUBSCRIBE_SESSION_EVENT, { sessionId: 'nope' })).toMatchObject({
      ok: false,
    });
    client.close();
  });
});
