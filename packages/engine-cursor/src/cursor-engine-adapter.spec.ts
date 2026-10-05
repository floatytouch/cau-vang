import { AuthenticationError, type AgentOptions, type SDKMessage } from '@cursor/sdk';
import { isHarnessEngine, isNootEvent, type ToolBridge } from '@noot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCursorEngineAdapter } from './cursor-engine-adapter.js';
import {
  collect,
  createMockAgent,
  createMockRun,
  eventTypes,
  TURN_OPTIONS,
} from './testing/mock-cursor-sdk.js';

const SESSION = { sessionId: 's1', history: [] };
const CONFIG = { cwd: '/tmp', apiKey: 'cursor_test' };

const THINKING: SDKMessage = { type: 'thinking', agent_id: 'a', run_id: 'r', text: 'hmm' };
const TEXT: SDKMessage = {
  type: 'assistant',
  agent_id: 'a',
  run_id: 'r',
  message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
};
const TOOL_RUNNING: SDKMessage = {
  type: 'tool_call',
  agent_id: 'a',
  run_id: 'r',
  call_id: 'c1',
  name: 'shell',
  status: 'running',
  args: { command: 'ls' },
};
const USAGE = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 15,
};

const EMPTY_BRIDGE: ToolBridge = {
  definitions: [],
  execute: async () => ({ ok: true, result: null }),
};

describe('createCursorEngineAdapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('advertises only capabilities it delivers', () => {
    const adapter = createCursorEngineAdapter(CONFIG, { createAgent: async () => ({}) as never });
    expect(isHarnessEngine(adapter.capabilities)).toBe(true);
    expect(adapter.capabilities.toolLoop).toBe('ownToolLoop');
    expect(adapter.capabilities.choices).toBe(false);
  });

  it('streams mapped events in seq order and ends with done(completed)', async () => {
    const { agent } = createMockAgent(async () =>
      createMockRun({ messages: [THINKING, TEXT], result: { usage: USAGE } }),
    );
    const adapter = createCursorEngineAdapter(CONFIG, { createAgent: async () => agent });

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(eventTypes(events)).toEqual(['thinking_delta', 'text_delta', 'usage', 'done']);
    expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3]);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });

  it('sends model and tools on every turn and creates one agent per session', async () => {
    const created: AgentOptions[] = [];
    const { agent, sendCalls } = createMockAgent(async () => createMockRun());
    const adapter = createCursorEngineAdapter(CONFIG, {
      createAgent: async (options) => {
        created.push(options);
        return agent;
      },
    });

    await Promise.all([
      collect(adapter.startTurn(SESSION, { text: 'a' }, { ...TURN_OPTIONS, tools: EMPTY_BRIDGE })),
      collect(adapter.startTurn(SESSION, { text: 'b' }, { ...TURN_OPTIONS, turnId: 't2' })),
    ]);
    await collect(
      adapter.startTurn(SESSION, { text: 'c' }, { ...TURN_OPTIONS, turnId: 't3', model: 'm2' }),
    );

    expect(created).toHaveLength(1);
    expect(sendCalls.map((options) => options?.model?.id)).toEqual([
      'composer-2.5',
      'composer-2.5',
      'm2',
    ]);
    expect(sendCalls[1]?.local?.customTools).toEqual({});
  });

  it('ignores CURSOR_API_KEY and omits apiKey on Agent.create when the option is absent', async () => {
    vi.stubEnv('CURSOR_API_KEY', 'env_key_must_be_ignored');
    const created: AgentOptions[] = [];
    const { agent } = createMockAgent(async () => createMockRun());
    const recordCreate = async (options: AgentOptions) => {
      created.push(options);
      return agent;
    };
    const storedLogin = createCursorEngineAdapter({ cwd: '/tmp' }, { createAgent: recordCreate });
    const explicitKey = createCursorEngineAdapter(CONFIG, { createAgent: recordCreate });

    await collect(storedLogin.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));
    await collect(explicitKey.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));

    expect(created[0]).not.toHaveProperty('apiKey');
    expect(created[1]?.apiKey).toBe('cursor_test');
  });

  it('surfaces the stream status message when a run fails without result.error', async () => {
    const statusError: SDKMessage = {
      type: 'status',
      agent_id: 'a',
      run_id: 'r',
      status: 'ERROR',
      message: 'custom system prompt not enabled for this plan',
    };
    const { agent } = createMockAgent(async () =>
      createMockRun({ messages: [statusError], result: { status: 'error' } }),
    );
    const adapter = createCursorEngineAdapter(CONFIG, { createAgent: async () => agent });

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));

    expect(eventTypes(events)).toEqual(['error', 'done']);
    expect(events[0]).toMatchObject({
      code: 'engine_error',
      message: expect.stringContaining('custom system prompt not enabled for this plan'),
    });
    expect(events.at(-1)).toMatchObject({ reason: 'failed' });
  });

  it('reports a failed agent creation without leaking the key and retries next turn', async () => {
    let attempts = 0;
    const { agent } = createMockAgent(async () => createMockRun());
    const adapter = createCursorEngineAdapter(
      { cwd: '/tmp', apiKey: 'key_must_not_leak' },
      {
        createAgent: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new AuthenticationError('Invalid API key');
          }
          return agent;
        },
      },
    );

    const failed = await collect(adapter.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));
    const retried = await collect(
      adapter.startTurn(SESSION, { text: 'hi' }, { ...TURN_OPTIONS, turnId: 't2' }),
    );

    expect(failed[0]).toMatchObject({ type: 'error', code: 'auth_failed' });
    expect(failed.at(-1)).toMatchObject({ type: 'done', reason: 'failed' });
    expect(JSON.stringify(failed)).not.toContain('key_must_not_leak');
    expect(retried.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
  });

  it('closes an open tool call and cancels the run when the stream throws mid-tool', async () => {
    const run = createMockRun({
      messages: [TOOL_RUNNING],
      streamError: new Error('transport dropped'),
    });
    const { agent } = createMockAgent(async () => run);
    const adapter = createCursorEngineAdapter(CONFIG, { createAgent: async () => agent });

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, TURN_OPTIONS));

    expect(eventTypes(events)).toEqual(['tool_call', 'error', 'tool_call', 'done']);
    expect(events[2]).toMatchObject({ phase: 'end', status: 'failed', callId: 'c1' });
    expect(events[1]).toMatchObject({ message: 'transport dropped' });
    expect(events.at(-1)).toMatchObject({ reason: 'failed' });
    expect(run.cancelCalls).toBe(1);
  });
});
