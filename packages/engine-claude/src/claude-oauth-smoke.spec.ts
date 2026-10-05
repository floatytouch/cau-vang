import { describe, expect, it } from 'vitest';

import { ClaudeEngineAdapter } from './claude-engine-adapter.js';
import { oauthSubprocessEnv } from './oauth-subprocess-env.js';

const RUN_OAUTH_SMOKE = process.env.NOOT_CLAUDE_OAUTH_SMOKE === '1';

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe.runIf(RUN_OAUTH_SMOKE)('Claude OAuth smoke', () => {
  it('streams thinking or text without ANTHROPIC_API_KEY in the subprocess env', async () => {
    expect(oauthSubprocessEnv().ANTHROPIC_API_KEY).toBeUndefined();

    const adapter = new ClaudeEngineAdapter();
    const events = await collect(
      adapter.startTurn(
        { sessionId: `smoke-${crypto.randomUUID()}`, history: [] },
        { text: 'Reply with exactly the word PONG and nothing else.' },
        {
          turnId: `turn-${crypto.randomUUID()}`,
          model: 'claude-sonnet-5',
          systemPrompt: 'You are a minimal smoke-test assistant.',
        },
      ),
    );

    const types = events.map((event) => event.type);
    expect(types).toContain('done');
    expect(types.some((type) => type === 'text_delta' || type === 'thinking_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });
});
