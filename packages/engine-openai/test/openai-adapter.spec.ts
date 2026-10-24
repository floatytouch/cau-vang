import { describe, expect, it } from 'vitest';
import {
  DONE_REASON_COMPLETED,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
} from '@noot/shared';
import { createOpenAiAdapter } from '../src/openai-adapter.js';
import { OpenAiClient } from '../src/openai-client.js';

describe('createOpenAiAdapter', () => {
  it('maps a completion into NootEvent stream', async () => {
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
    const events = [];
    for await (const event of adapter.startTurn(
      { sessionId: 's1', history: [] },
      { text: 'ping' },
      { turnId: 't1', model: 'test-model', systemPrompt: 'sys' },
    )) {
      events.push(event);
    }

    expect(events.some((e) => e.type === NOOT_EVENT_TYPE_TEXT_DELTA && e.text === 'hello')).toBe(
      true,
    );
    expect(events.at(-1)).toMatchObject({
      type: NOOT_EVENT_TYPE_DONE,
      reason: DONE_REASON_COMPLETED,
    });
  });
});
