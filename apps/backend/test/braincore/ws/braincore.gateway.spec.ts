import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  WS_CHAT_SEND_EVENT,
  WS_NOOT_EVENT,
  WS_SUBSCRIBE_SESSION_EVENT,
  type NootEvent,
} from '@noot/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { DEFAULT_MAX_CHAT_TEXT_LENGTH } from '../../../src/config/app-config.js';
import { BraincoreService } from '../../../src/braincore/braincore.service.js';
import { MOCK_ENGINE_ID } from '../../../src/braincore/testing/mock-engine-adapter.js';

const ENV_KEYS = ['NOOT_BRAINCORE_DATA_DIR', 'NOOT_BRAINCORE_MOCK_ENGINES'] as const;

/** Minimal Socket.IO v5 client over the built-in WebSocket: connect, emit-with-ack, collect events. */
class RawSocketIoClient {
  private nextAckId = 0;
  private readonly acks = new Map<number, (value: unknown) => void>();
  readonly events: { name: string; payload: unknown }[] = [];
  private connected!: () => void;
  readonly ready = new Promise<void>((resolve) => (this.connected = resolve));

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (message) => this.onFrame(String(message.data)));
  }

  static async connect(port: number): Promise<RawSocketIoClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    const client = new RawSocketIoClient(socket);
    await client.ready;
    return client;
  }

  emit(name: string, payload: unknown): Promise<unknown> {
    const ackId = this.nextAckId++;
    this.socket.send(`42${ackId}${JSON.stringify([name, payload])}`);
    return new Promise((resolve) => this.acks.set(ackId, resolve));
  }

  close(): void {
    this.socket.close();
  }

  private onFrame(frame: string): void {
    if (frame.startsWith('0')) {
      this.socket.send('40');
    } else if (frame === '2') {
      this.socket.send('3');
    } else if (frame.startsWith('40')) {
      this.connected();
    } else if (frame.startsWith('43')) {
      const match = /^43(\d+)(.*)$/s.exec(frame);
      const [payload] = JSON.parse(match![2]!) as unknown[];
      this.acks.get(Number(match![1]))?.(payload);
    } else if (frame.startsWith('42')) {
      const [name, payload] = JSON.parse(frame.slice(2)) as [string, unknown];
      this.events.push({ name, payload });
    }
  }
}

describe('BraincoreGateway over a real Socket.IO connection', () => {
  let app: INestApplication;
  let dataDir: string;
  let client: RawSocketIoClient;
  const savedEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-3-gateway-'));
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    process.env.NOOT_BRAINCORE_DATA_DIR = dataDir;
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = await RawSocketIoClient.connect(port);
  });

  afterAll(async () => {
    client?.close();
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

  it('streams the turn to subscribers in seq order and acks the send', async () => {
    const session = await app.get(BraincoreService).createSession(MOCK_ENGINE_ID, 'mock-model');
    expect(await client.emit(WS_SUBSCRIBE_SESSION_EVENT, { sessionId: session.id })).toEqual({
      ok: true,
    });

    expect(
      await client.emit(WS_CHAT_SEND_EVENT, { sessionId: session.id, text: 'hi there' }),
    ).toEqual({
      ok: true,
    });

    const payloads = client.events
      .filter((event) => event.name === WS_NOOT_EVENT)
      .map((event) => (event.payload as { payload: NootEvent }).payload);
    expect(payloads.map((event) => [event.type, event.seq])).toEqual([
      ['text_delta', 0],
      ['done', 1],
    ]);
    expect(payloads[0]).toMatchObject({ sessionId: session.id, text: 'hi there' });
  });

  it.each([
    [{}, /required/],
    [{ sessionId: 42, text: 'x' }, /required/],
    [{ sessionId: 'nope', text: 'x' }, /Unknown session/],
    [{ sessionId: 'x', text: 'y'.repeat(DEFAULT_MAX_CHAT_TEXT_LENGTH + 1) }, /exceeds/],
  ])('rejects a bad chat_send payload %#', async (payload, message) => {
    const ack = (await client.emit(WS_CHAT_SEND_EVENT, payload)) as { ok: boolean; error: string };
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(message);
  });

  it('refuses to subscribe to an unknown session', async () => {
    expect(await client.emit(WS_SUBSCRIBE_SESSION_EVENT, { sessionId: '../etc' })).toMatchObject({
      ok: false,
    });
  });
});
