import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { isBareApiEngine } from '@noot/shared';
import type { NootEvent } from '@noot/shared';
import { createLumoAdapter, LUMO_CAPABILITIES } from './lumo-adapter.js';
import { LumoProxyClient } from './lumo-proxy-client.js';

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
    server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: 'pong' } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
      );
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
        { turnId: 't1', model: 'lumo-lite', systemPrompt: 'You are Not.' },
      ),
    );

    expect(events.map((event) => event.type)).toEqual(['text_delta', 'usage', 'done']);
    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'pong' });
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });
});
