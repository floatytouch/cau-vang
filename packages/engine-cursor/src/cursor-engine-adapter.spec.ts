import type { Run, SDKAgent, SDKMessage } from '@cursor/sdk';
import { isHarnessEngine, isNootEvent } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { createCursorEngineAdapter } from './cursor-engine-adapter.js';

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function createMockRun(messages: SDKMessage[]): Run {
  let status: Run['status'] = 'running';
  let cancelCalls = 0;

  const run: Run = {
    id: 'run-1',
    agentId: 'agent-1',
    status,
    supports: (operation) =>
      operation === 'cancel' || operation === 'stream' || operation === 'wait',
    unsupportedReason: () => undefined,
    async *stream() {
      for (const message of messages) {
        yield message;
      }
    },
    conversation: async () => [],
    wait: async () => {
      const terminalStatus = cancelCalls > 0 ? 'cancelled' : 'finished';
      status = terminalStatus;
      return {
        id: 'run-1',
        status: terminalStatus,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 15,
        },
      };
    },
    cancel: async () => {
      cancelCalls += 1;
      status = 'cancelled';
    },
    onDidChangeStatus: () => () => {},
  };

  return run;
}

describe('createCursorEngineAdapter', () => {
  it('advertises harness capabilities with ownToolLoop', () => {
    const adapter = createCursorEngineAdapter(
      { cwd: '/tmp', apiKey: 'cursor_test' },
      { createAgent: async () => ({}) as SDKAgent },
    );
    expect(isHarnessEngine(adapter.capabilities)).toBe(true);
    expect(adapter.capabilities.toolLoop).toBe('ownToolLoop');
  });

  it('streams mapped events and ends with done', async () => {
    const messages: SDKMessage[] = [
      { type: 'thinking', agent_id: 'a', run_id: 'r', text: 'hmm' },
      {
        type: 'assistant',
        agent_id: 'a',
        run_id: 'r',
        message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      },
    ];

    const adapter = createCursorEngineAdapter(
      { cwd: '/tmp', apiKey: 'cursor_test' },
      {
        createAgent: async () =>
          ({
            send: async () => createMockRun(messages),
            close: () => {},
          }) as unknown as SDKAgent,
      },
    );

    const events = await collect(
      adapter.startTurn(
        { sessionId: 's1', history: [] },
        { text: 'hi' },
        {
          turnId: 't1',
          model: 'composer-2.5',
          systemPrompt: 'You are Not.',
        },
      ),
    );

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'thinking_delta',
      'text_delta',
      'usage',
      'done',
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });

  it('cancel ends the turn with done(cancelled)', async () => {
    const slowMessages: SDKMessage[] = [
      { type: 'thinking', agent_id: 'a', run_id: 'r', text: 'slow' },
    ];

    const adapter = createCursorEngineAdapter(
      { cwd: '/tmp', apiKey: 'cursor_test', turnTimeoutMs: 60_000 },
      {
        createAgent: async () =>
          ({
            send: async () => createMockRun(slowMessages),
            close: () => {},
          }) as unknown as SDKAgent,
      },
    );

    const stream = adapter.startTurn(
      { sessionId: 's2', history: [] },
      { text: 'go' },
      {
        turnId: 't-cancel',
        model: 'composer-2.5',
        systemPrompt: 'You are Not.',
      },
    );

    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'thinking_delta' });

    await adapter.cancel('t-cancel');
    const rest = await collect({ [Symbol.asyncIterator]: () => iterator });

    expect(rest.at(-1)).toMatchObject({ type: 'done', reason: 'cancelled' });
  });
});
