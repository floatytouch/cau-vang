import { isNootEvent } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { createCursorEngineAdapter } from './cursor-engine-adapter.js';
import { resolveCursorApiKeyOptional } from './resolve-api-key.js';

const smokeEnabled = process.env.NOOT_CURSOR_SMOKE === '1';

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe.skipIf(!smokeEnabled)('cursor composer smoke', () => {
  it('maps a real composer turn to thinking, text, and terminal done', async () => {
    const apiKey = resolveCursorApiKeyOptional();
    const adapter = createCursorEngineAdapter({
      cwd: process.cwd(),
      ...(apiKey !== undefined ? { apiKey } : {}),
      turnTimeoutMs: 120_000,
    });

    const events = await collect(
      adapter.startTurn(
        { sessionId: 'smoke-session', history: [] },
        { text: 'Reply with exactly: pong' },
        {
          turnId: 'smoke-turn',
          model: 'composer-2.5',
          systemPrompt: 'You are a concise assistant.',
        },
      ),
    );

    expect(events.every(isNootEvent)).toBe(true);
    const types = events.map((event) => (event as { type: string }).type);
    expect(types).toContain('text_delta');
    expect(types.at(-1)).toBe('done');
  }, 180_000);
});
