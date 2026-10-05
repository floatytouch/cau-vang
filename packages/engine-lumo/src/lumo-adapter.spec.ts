import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { isBareApiEngine, isNootEvent } from '@noot/shared';
import type { NootEvent, TurnOptions } from '@noot/shared';
import { createLumoAdapter, LUMO_CAPABILITIES } from './lumo-adapter.js';
import { LUMO_API_KEY_ENV, LUMO_BASE_URL_ENV } from './lumo-config.js';
import { LumoProxyClient } from './lumo-proxy-client.js';

const SESSION = { sessionId: 's1', history: [] };
const OPTIONS: TurnOptions = { turnId: 't1', model: 'lumo-lite', systemPrompt: 'You are Not.' };

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('LUMO capability flags', () => {
  it('declares bareApi with no thinking stream or sessions', () => {
    expect(LUMO_CAPABILITIES).toEqual({
      toolLoop: 'bareApi',
      thinkingStream: false,
      sessions: false,
      choices: false,
    });
    expect(isBareApiEngine(LUMO_CAPABILITIES)).toBe(true);
  });
});

describe('createLumoAdapter smoke through HTTP', () => {
  let server: Server | undefined;
  let baseUrl = '';

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
  });

  it('completes one turn against a local stand-in proxy', async () => {
    let received: { authorization?: string; body: Record<string, unknown> } | undefined;
    server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      void readJson(request).then((body) => {
        received = { authorization: request.headers.authorization, body };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [{ message: { content: 'pong' } }],
            usage: { prompt_tokens: 5, completion_tokens: 1 },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected server to bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}/v1`;

    const adapter = createLumoAdapter({
      client: new LumoProxyClient({
        config: { baseUrl, apiKey: 'smoke-key' },
      }),
    });

    const events = await collect(
      adapter.startTurn(
        { sessionId: 's1', history: [{ role: 'user', text: 'ping' }] },
        { text: 'ping' },
        {
          ...OPTIONS,
          tools: { definitions: [], execute: async () => ({ ok: true, result: null }) },
        },
      ),
    );

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'usage', 'done']);
    expect(received?.authorization).toBe('Bearer smoke-key');
    expect(received?.body).toMatchObject({ model: 'lumo-lite', reasoning_effort: 'none' });
    expect(received?.body).not.toHaveProperty('tools');
    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'pong' });
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });
});

describe('createLumoAdapter recap budgets', () => {
  it('threads factory budget overrides into the request sent to the proxy', async () => {
    let sentMessages: unknown;
    const adapter = createLumoAdapter({
      budgets: { charBudget: 20, messageLimit: 10, messageChars: 50 },
      client: new LumoProxyClient({
        config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k' },
        fetchImpl: async (_url, init) => {
          sentMessages = (JSON.parse(String(init?.body)) as { messages: unknown }).messages;
          return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
        },
      }),
    });
    const history = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'].map((text) => ({
      role: 'user' as const,
      text,
    }));

    await collect(adapter.startTurn({ sessionId: 's1', history }, { text: 'now' }, OPTIONS));

    expect(sentMessages).toEqual([
      { role: 'system', content: OPTIONS.systemPrompt },
      { role: 'user', content: 'bbbbbbbbbb' },
      { role: 'user', content: 'cccccccccc' },
      { role: 'user', content: 'now' },
    ]);
  });
});

describe('createLumoAdapter failures', () => {
  it('reports a missing API key as one failed turn instead of throwing at creation', async () => {
    const adapter = createLumoAdapter({ apiKey: '   ' });
    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['error', 'done']);
    expect(events[0]).toMatchObject({ code: 'missing_credentials', recoverable: false });
    expect(events[1]).toMatchObject({ reason: 'failed' });
  });

  it('ignores LUMO_* environment variables and still fails the turn without an apiKey', async () => {
    const saved = {
      apiKey: process.env[LUMO_API_KEY_ENV],
      baseUrl: process.env[LUMO_BASE_URL_ENV],
    };
    process.env[LUMO_API_KEY_ENV] = 'env-key-must-be-ignored';
    process.env[LUMO_BASE_URL_ENV] = 'http://127.0.0.1:1/v1';
    try {
      const adapter = createLumoAdapter();
      const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

      expect(events.map((event) => event.type)).toEqual(['error', 'done']);
      expect(events[0]).toMatchObject({ code: 'missing_credentials', recoverable: false });
    } finally {
      restoreEnv(LUMO_API_KEY_ENV, saved.apiKey);
      restoreEnv(LUMO_BASE_URL_ENV, saved.baseUrl);
    }
  });

  it('rejects an invalid requestTimeoutMs at creation', () => {
    expect(() => createLumoAdapter({ apiKey: 'k', requestTimeoutMs: 0 })).toThrow(RangeError);
  });

  it('reports a proxy that refuses connections as engine_unavailable', async () => {
    const adapter = createLumoAdapter({
      client: new LumoProxyClient({
        config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k' },
        fetchImpl: async () => {
          throw new TypeError('fetch failed: ECONNREFUSED');
        },
      }),
    });

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(events[0]).toMatchObject({
      type: 'error',
      code: 'engine_unavailable',
      recoverable: false,
    });
    expect((events[0] as { message: string }).message).toContain('ECONNREFUSED');
    expect(events.map((event) => event.seq)).toEqual([0, 1]);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'failed' });
  });

  it('reports an empty answer as a failed turn', async () => {
    const adapter = createLumoAdapter({
      client: new LumoProxyClient({
        config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k' },
        fetchImpl: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] })),
      }),
    });

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

    expect(events.map((event) => event.type)).toEqual(['error', 'done']);
    expect(events[0]).toMatchObject({ code: 'empty_answer' });
  });

  it('ends a cancelled in-flight turn with done(cancelled) only', async () => {
    let requestStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const adapter = createLumoAdapter({
      client: new LumoProxyClient({
        config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'k' },
        fetchImpl: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            requestStarted();
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      }),
    });

    const pending = collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));
    await started;
    await adapter.cancel(OPTIONS.turnId);
    const events = await pending;

    expect(events.every(isNootEvent)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'done', reason: 'cancelled', seq: 0 });
  });
});

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
