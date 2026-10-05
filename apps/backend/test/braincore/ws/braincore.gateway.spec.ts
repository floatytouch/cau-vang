import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DONE_REASON_CANCELLED,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  WS_AUTH_ERROR_CODE,
  WS_AUTH_ERROR_EVENT,
  WS_AUTH_TOKEN_KEY,
  WS_CANCEL_TURN_EVENT,
  WS_CHAT_SEND_EVENT,
  WS_LIST_ENGINES_EVENT,
  WS_NOOT_EVENT,
  WS_SET_MODE_EVENT,
  WS_SUBSCRIBE_SESSION_EVENT,
  type EngineAdapter,
  type NootEvent,
  type WsAuthErrorMessage,
} from '@noot/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { DEFAULT_MAX_CHAT_TEXT_LENGTH } from '../../../src/config/app-config.js';
import { BraincoreService } from '../../../src/braincore/braincore.service.js';
import {
  MOCK_ENGINE_CAPABILITIES,
  MOCK_ENGINE_ID,
} from '../../../src/braincore/testing/mock-engine-adapter.js';
import { RawSocketIoClient } from '../../../src/braincore/testing/raw-socket-io-client.js';
import { WS_UNAUTHORIZED_MESSAGE } from '../../../src/braincore/ws/ws-auth.js';

const BLOCKING_ENGINE_ID = 'blocking-until-cancel';

/** Streams one delta, then holds the turn open until cancel() releases it as `done(cancelled)`. */
function createBlockingAdapter(): EngineAdapter {
  let release: () => void = () => {};
  return {
    id: BLOCKING_ENGINE_ID,
    capabilities: MOCK_ENGINE_CAPABILITIES,
    async *startTurn(session, _input, options) {
      const meta = { sessionId: session.sessionId, turnId: options.turnId };
      const emittedAt = new Date().toISOString();
      yield {
        ...meta,
        seq: 0,
        emittedAt,
        type: NOOT_EVENT_TYPE_TEXT_DELTA,
        text: 'partial',
      } satisfies NootEvent;
      await new Promise<void>((resolve) => (release = resolve));
      yield {
        ...meta,
        seq: 1,
        emittedAt,
        type: NOOT_EVENT_TYPE_DONE,
        reason: DONE_REASON_CANCELLED,
      } satisfies NootEvent;
    },
    async cancel() {
      release();
    },
  };
}

const ENV_KEYS = [
  'NOOT_BRAINCORE_DATA_DIR',
  'NOOT_BRAINCORE_MOCK_ENGINES',
  'NOOT_WS_TOKEN',
] as const;

const GATEWAY_WS_TOKEN = 'nv10-gateway-test-token';
const LOGGER_METHODS = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const;

async function connect(port: number, token: string): Promise<RawSocketIoClient> {
  const client = RawSocketIoClient.open(port, { auth: { [WS_AUTH_TOKEN_KEY]: token } });
  await client.ready;
  return client;
}

describe('BraincoreGateway over a real Socket.IO connection', () => {
  let app: INestApplication;
  let dataDir: string;
  let port: number;
  let client: RawSocketIoClient;
  const savedEnv = new Map<string, string | undefined>();
  const logSpies = LOGGER_METHODS.map((method) => vi.spyOn(Logger.prototype, method));
  const loggedText = () => JSON.stringify(logSpies.map((spy) => spy.mock.calls));

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-gateway-'));
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    process.env.NOOT_BRAINCORE_DATA_DIR = dataDir;
    process.env.NOOT_BRAINCORE_MOCK_ENGINES = '1';
    process.env.NOOT_WS_TOKEN = GATEWAY_WS_TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    client = await connect(port, GATEWAY_WS_TOKEN);
  });

  afterAll(async () => {
    client?.close();
    await app?.close();
    logSpies.forEach((spy) => spy.mockRestore());
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

    const sendAck = (await client.emit(WS_CHAT_SEND_EVENT, {
      sessionId: session.id,
      text: 'hi there',
    })) as { ok: boolean; turnId?: string };
    expect(sendAck.ok).toBe(true);
    expect(sendAck.turnId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const payloads = client.events
      .filter((event) => event.name === WS_NOOT_EVENT)
      .map((event) => (event.payload as { payload: NootEvent }).payload);
    expect(payloads.map((event) => [event.type, event.seq])).toEqual([
      ['progress', 0],
      [NOOT_EVENT_TYPE_TEXT_DELTA, 1],
      ['usage', 2],
      ['progress', 3],
      [NOOT_EVENT_TYPE_DONE, 4],
    ]);
    expect(payloads[1]).toMatchObject({ sessionId: session.id, text: 'hi there' });
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

  it('lists registered engines and stores Plan/Auto mode per session', async () => {
    const enginesAck = (await client.emit(WS_LIST_ENGINES_EVENT, {})) as {
      ok: boolean;
      engines: { id: string }[];
    };
    expect(enginesAck.ok).toBe(true);
    expect(enginesAck.engines.map((engine) => engine.id).sort()).toEqual(['mock', 'mock-harness']);

    const session = await app.get(BraincoreService).createSession(MOCK_ENGINE_ID, 'mock-model');
    expect(await client.emit(WS_SET_MODE_EVENT, { sessionId: session.id, mode: 'plan' })).toEqual({
      ok: true,
      mode: 'plan',
    });
    expect(
      await client.emit(WS_SET_MODE_EVENT, { sessionId: session.id, mode: 'nope' }),
    ).toMatchObject({
      ok: false,
    });
  });

  it.each([
    [{}, /sessionId is required/],
    [{ turnId: 'only-a-turn' }, /sessionId is required/],
    [{ sessionId: 'nope' }, /Unknown session/],
  ])('rejects a bad cancel_turn payload %#', async (payload, message) => {
    const ack = (await client.emit(WS_CANCEL_TURN_EVENT, payload)) as FunnelAckShape;
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(message);
  });

  it('cancels only the running turn of the named session', async () => {
    const braincore = app.get(BraincoreService);
    braincore.engines.register(createBlockingAdapter());
    const session = await braincore.createSession(BLOCKING_ENGINE_ID, 'blocking-model');
    const bystander = await braincore.createSession(MOCK_ENGINE_ID, 'mock-model');
    await client.emit(WS_SUBSCRIBE_SESSION_EVENT, { sessionId: session.id });

    const sendAck = client.emit(WS_CHAT_SEND_EVENT, { sessionId: session.id, text: 'hold' });
    const firstDelta = await waitForEvent(client, session.id, NOOT_EVENT_TYPE_TEXT_DELTA);

    expect(await client.emit(WS_CANCEL_TURN_EVENT, { sessionId: bystander.id })).toEqual({
      ok: true,
    });
    expect(
      await client.emit(WS_CANCEL_TURN_EVENT, {
        sessionId: bystander.id,
        turnId: firstDelta.turnId,
      }),
    ).toEqual({ ok: true });
    const foreignTurn = (await client.emit(WS_CANCEL_TURN_EVENT, {
      sessionId: session.id,
      turnId: 'not-the-running-turn',
    })) as FunnelAckShape;
    expect(foreignTurn).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not the running turn/),
    });

    expect(
      await client.emit(WS_CANCEL_TURN_EVENT, { sessionId: session.id, turnId: firstDelta.turnId }),
    ).toEqual({ ok: true });
    expect(await sendAck).toMatchObject({ ok: true, turnId: firstDelta.turnId });
    const done = await waitForEvent(client, session.id, NOOT_EVENT_TYPE_DONE);
    expect(done).toMatchObject({ reason: DONE_REASON_CANCELLED });
    expect(await client.emit(WS_CANCEL_TURN_EVENT, { sessionId: session.id })).toEqual({
      ok: true,
    });
  });

  it('rejects a connect with no token with an auth_error envelope', async () => {
    const rejected = RawSocketIoClient.open(port);
    expect(await rejected.rejection()).toEqual({
      message: WS_UNAUTHORIZED_MESSAGE,
      data: {
        type: WS_AUTH_ERROR_EVENT,
        payload: { code: WS_AUTH_ERROR_CODE, message: WS_UNAUTHORIZED_MESSAGE },
        sentAt: expect.any(String),
      } satisfies WsAuthErrorMessage,
    });
    rejected.close();
  });

  it.each([
    ['a longer token', `${GATEWAY_WS_TOKEN}-wrong`],
    ['a same-length token', `${GATEWAY_WS_TOKEN.slice(0, -1)}X`],
  ])('rejects %s and logs the rejection without any token', async (_label, token) => {
    logSpies.forEach((spy) => spy.mockClear());
    const rejected = RawSocketIoClient.open(port, { auth: { [WS_AUTH_TOKEN_KEY]: token } });
    expect(await rejected.rejection()).toMatchObject({ message: WS_UNAUTHORIZED_MESSAGE });
    rejected.close();
    const logged = loggedText();
    expect(logged).toContain('websocket handshake rejected');
    expect(logged).not.toContain(GATEWAY_WS_TOKEN);
    expect(logged).not.toContain(token);
  });

  it('rejects the correct token when it only arrives in the URL query', async () => {
    const rejected = RawSocketIoClient.open(port, {
      query: { [WS_AUTH_TOKEN_KEY]: GATEWAY_WS_TOKEN },
    });
    expect(await rejected.rejection()).toMatchObject({ message: WS_UNAUTHORIZED_MESSAGE });
    rejected.close();
  });

  it('accepts concurrent connects that present the correct token', async () => {
    const clients = await Promise.all(
      Array.from({ length: 5 }, () => connect(port, GATEWAY_WS_TOKEN)),
    );
    expect(await clients[0]!.emit(WS_SUBSCRIBE_SESSION_EVENT, { sessionId: 'nope' })).toEqual({
      ok: false,
      error: 'unknown sessionId',
    });
    clients.forEach((connected) => connected.close());
  });
});

interface FunnelAckShape {
  ok: boolean;
  error?: string;
}

async function waitForEvent(
  client: RawSocketIoClient,
  sessionId: string,
  type: NootEvent['type'],
): Promise<NootEvent> {
  for (;;) {
    const match = client.events
      .filter((event) => event.name === WS_NOOT_EVENT)
      .map((event) => (event.payload as { payload: NootEvent }).payload)
      .find((event) => event.sessionId === sessionId && event.type === type);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
