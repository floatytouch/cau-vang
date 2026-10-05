import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { EngineSession, NootEvent, TurnOptions } from '@noot/shared';
import { isNootEvent } from '@noot/shared';
import { describe, expect, it, vi } from 'vitest';

import { ClaudeEngineAdapter } from './claude-engine-adapter.js';
import type { ClaudeQueryFactory } from './claude-query-factory.js';
import { SessionHandleStore } from './session-handle-store.js';

const SESSION: EngineSession = { sessionId: 'brain-session', history: [] };

const OPTIONS: TurnOptions = {
  turnId: 'turn-1',
  model: 'claude-sonnet-5',
  systemPrompt: 'BRAIN_SYSTEM_PROMPT_BYTES',
};

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function mockQueryFactory(
  messages: SDKMessage[],
  hooks?: { onQuery?: (args: unknown) => void },
): {
  factory: ClaudeQueryFactory;
  interrupt: ReturnType<typeof vi.fn>;
} {
  const interrupt = vi.fn(async () => undefined);
  const factory: ClaudeQueryFactory = (params) => {
    hooks?.onQuery?.(params);
    const iterator = {
      async next() {
        const value = messages.shift();
        if (!value) {
          return { done: true, value: undefined };
        }
        return { done: false, value };
      },
      async return() {
        return { done: true, value: undefined };
      },
      async throw(error: unknown) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
      interrupt,
    } as unknown as Query;
    return iterator;
  };
  return { factory, interrupt };
}

describe('ClaudeEngineAdapter', () => {
  it('passes the BrainCore system prompt byte-identical and disables API key env', () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const { factory } = mockQueryFactory(
      [
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1,
          duration_api_ms: 1,
          is_error: false,
          num_turns: 1,
          stop_reason: 'end_turn',
          result: 'ok',
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1 },
          modelUsage: {},
          permission_denials: [],
          errors: [],
          uuid: 'r1',
          session_id: 'claude-uuid',
        } as unknown as SDKMessage,
      ],
      {
        onQuery: (params) => {
          const options = (params as { options?: Record<string, unknown> }).options;
          capturedOptions = options;
        },
      },
    );

    const adapter = new ClaudeEngineAdapter({ queryFactory: factory });
    return collect(adapter.startTurn(SESSION, { text: 'hello' }, OPTIONS)).then((events) => {
      expect(capturedOptions?.systemPrompt).toBe('BRAIN_SYSTEM_PROMPT_BYTES');
      const env = capturedOptions?.env as Record<string, unknown>;
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
      expect(events.every(isNootEvent)).toBe(true);
    });
  });

  it('resumes Claude sessions per brain session id', async () => {
    const handles = new SessionHandleStore();
    handles.remember('brain-session', 'claude-uuid-resume');

    const captured: string[] = [];
    const { factory } = mockQueryFactory(
      [
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1,
          duration_api_ms: 1,
          is_error: false,
          num_turns: 1,
          stop_reason: 'end_turn',
          result: 'ok',
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1 },
          modelUsage: {},
          permission_denials: [],
          errors: [],
          uuid: 'r1',
          session_id: 'claude-uuid-resume',
        } as unknown as SDKMessage,
      ],
      {
        onQuery: (params) => {
          const resume = (params as { options?: { resume?: string } }).options?.resume;
          if (resume) {
            captured.push(resume);
          }
        },
      },
    );

    const adapter = new ClaudeEngineAdapter({ queryFactory: factory, sessionHandles: handles });
    await collect(adapter.startTurn(SESSION, { text: 'again' }, { ...OPTIONS, turnId: 'turn-2' }));
    expect(captured).toEqual(['claude-uuid-resume']);
  });

  it('cancel aborts the SDK turn and calls interrupt', async () => {
    const interrupt = vi.fn(async () => undefined);
    let abortController: AbortController | undefined;

    const factory: ClaudeQueryFactory = (params) => {
      abortController = params.options?.abortController;
      const pending: SDKMessage[] = [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'partial' },
          },
          parent_tool_use_id: null,
          uuid: 'u1',
          session_id: 'claude-s1',
        } as unknown as SDKMessage,
      ];
      return {
        async next() {
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => reject(new Error('aborted'));
            if (abortController?.signal.aborted) {
              reject(new Error('aborted'));
              return;
            }
            abortController?.signal.addEventListener('abort', onAbort, { once: true });
            setTimeout(resolve, 30_000);
          });
          const value = pending.shift();
          if (!value) {
            return { done: true, value: undefined };
          }
          return { done: false, value };
        },
        async return() {
          return { done: true, value: undefined };
        },
        async throw(error: unknown) {
          throw error;
        },
        [Symbol.asyncIterator]() {
          return this;
        },
        interrupt,
      } as unknown as Query;
    };

    const adapter = new ClaudeEngineAdapter({ queryFactory: factory });
    const eventsPromise = collect(
      adapter.startTurn(SESSION, { text: 'slow' }, { ...OPTIONS, turnId: 'turn-cancel' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    await adapter.cancel('turn-cancel');

    const events = await eventsPromise;
    expect(abortController?.signal.aborted).toBe(true);
    expect(interrupt).toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'cancelled' });
  });

  it('exposes harness capability flags', () => {
    const adapter = new ClaudeEngineAdapter({
      queryFactory: mockQueryFactory([]).factory,
    });
    expect(adapter.capabilities).toEqual({
      toolLoop: 'ownToolLoop',
      thinkingStream: true,
      sessions: true,
      choices: true,
    });
  });
});
