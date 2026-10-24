import { describe, expect, it } from 'vitest';
import { isNootEvent } from '@noot/shared';
import type { NootEvent, TurnOptions } from '@noot/shared';
import { createOpenAiAdapter, OPENAI_CAPABILITIES } from '../src/openai-adapter.js';
import { OPENAI_API_KEY_ENV, OPENAI_BASE_URL_ENV } from '../src/openai-config.js';
import { OpenAiClient } from '../src/openai-client.js';

const SESSION = { sessionId: 's1', history: [] };
const OPTIONS: TurnOptions = { turnId: 't1', model: 'test-model', systemPrompt: 'sys' };

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('OPENAI capability flags', () => {
  it('declares bareApi with no thinking stream or sessions', () => {
    expect(OPENAI_CAPABILITIES).toEqual({
      toolLoop: 'bareApi',
      thinkingStream: false,
      sessions: false,
      choices: false,
    });
  });
});

describe('createOpenAiAdapter', () => {
  it('maps a completion into a valid NootEvent stream', async () => {
    const client = new OpenAiClient({
      config: { apiKey: 'test-key', baseUrl: 'http://example.test/v1' },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 1, completion_tokens: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const adapter = createOpenAiAdapter({ client });
    const events = await collect(adapter.startTurn(SESSION, { text: 'ping' }, OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'usage', 'done']);
    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'hello' });
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });
});

describe('createOpenAiAdapter failures', () => {
  it('reports a missing API key as one failed turn instead of throwing at creation', async () => {
    const adapter = createOpenAiAdapter({ apiKey: '   ' });
    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['error', 'done']);
    expect(events[0]).toMatchObject({ code: 'missing_credentials', recoverable: false });
    expect(events[1]).toMatchObject({ reason: 'failed' });
  });

  it('ignores OPENAI_* environment variables without an apiKey in the factory', async () => {
    const saved = {
      apiKey: process.env[OPENAI_API_KEY_ENV],
      baseUrl: process.env[OPENAI_BASE_URL_ENV],
    };
    process.env[OPENAI_API_KEY_ENV] = 'env-key-must-be-ignored';
    process.env[OPENAI_BASE_URL_ENV] = 'http://127.0.0.1:1/v1';
    try {
      const adapter = createOpenAiAdapter();
      const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

      expect(events.map((event) => event.type)).toEqual(['error', 'done']);
      expect(events[0]).toMatchObject({ code: 'missing_credentials', recoverable: false });
    } finally {
      restoreEnv(OPENAI_API_KEY_ENV, saved.apiKey);
      restoreEnv(OPENAI_BASE_URL_ENV, saved.baseUrl);
    }
  });

  it('reports an empty model answer as empty_answer', async () => {
    const adapter = createOpenAiAdapter({
      client: new OpenAiClient({
        config: { apiKey: 'k', baseUrl: 'http://example.test/v1' },
        fetchImpl: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
            status: 200,
          }),
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
    const adapter = createOpenAiAdapter({
      client: new OpenAiClient({
        config: { apiKey: 'k', baseUrl: 'http://example.test/v1' },
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
