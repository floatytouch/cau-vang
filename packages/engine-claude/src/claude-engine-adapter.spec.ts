import type { Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { EngineSession, NootEvent, ToolBridge, TurnOptions } from '@noot/shared';
import { isNootEvent } from '@noot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClaudeEngineAdapter } from './claude-engine-adapter.js';
import type { ClaudeQueryFactory } from './claude-query-factory.js';
import { SessionHandleStore } from './session-handle-store.js';

const SESSION: EngineSession = { sessionId: 'brain-session', history: [] };
const SOUL_PROMPT = 'N\u1ed1t\u00a0\u2014 soul line one\r\n  trailing spaces  \n\u{1F33F} emoji\n';
const OPTIONS: TurnOptions = {
  turnId: 'turn-1',
  model: 'claude-sonnet-5',
  systemPrompt: SOUL_PROMPT,
};

const INIT: SDKMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'claude-uuid',
} as unknown as SDKMessage;
const SUCCESS: SDKMessage = {
  type: 'result',
  subtype: 'success',
  modelUsage: {},
  errors: [],
  session_id: 'claude-uuid',
} as unknown as SDKMessage;
const STALE_RESULT: SDKMessage = {
  type: 'result',
  subtype: 'error_during_execution',
  modelUsage: {},
  errors: ['No conversation found with session ID: stale-id'],
  session_id: 'stale-id',
} as unknown as SDKMessage;

interface FakeQuery {
  factory: ClaudeQueryFactory;
  calls: Options[];
  close: ReturnType<typeof vi.fn>;
}

/** `script` runs per message pull; it may throw to simulate the SDK failing mid-stream. */
function fakeQuery(script: (options: Options) => AsyncGenerator<SDKMessage>): FakeQuery {
  const calls: Options[] = [];
  const close = vi.fn();
  const factory: ClaudeQueryFactory = (params) => {
    const options = params.options ?? {};
    calls.push(options);
    return Object.assign(script(options), { close }) as unknown as Query;
  };
  return { factory, calls, close };
}

function replay(...messages: SDKMessage[]) {
  return fakeQuery(async function* () {
    yield* messages;
  });
}

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function expectWellFormedTurn(events: NootEvent[], reason: string): void {
  expect(events.every(isNootEvent)).toBe(true);
  expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index));
  expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ type: 'done', reason });
}

const ECHO_TOOLS: ToolBridge = {
  definitions: [
    {
      name: 'echo',
      description: 'Echo',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    },
  ],
  execute: async () => ({ ok: true, result: 'ok' }),
};

describe('ClaudeEngineAdapter options', () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  afterEach(() => {
    for (const [name, value] of [
      ['ANTHROPIC_API_KEY', saved.key],
      ['ANTHROPIC_AUTH_TOKEN', saved.token],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('passes the BrainCore system prompt byte-identical with nothing appended', async () => {
    const fake = replay(INIT, SUCCESS);
    await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
        SESSION,
        { text: 'hi' },
        OPTIONS,
      ),
    );
    const options = fake.calls[0];
    expect(options?.systemPrompt).toBe(SOUL_PROMPT);
    expect(Buffer.from(String(options?.systemPrompt)).equals(Buffer.from(SOUL_PROMPT))).toBe(true);
    expect(options).toMatchObject({
      tools: [],
      settingSources: [],
      verbatimPrompts: true,
      strictMcpConfig: true,
    });
    expect(options).not.toHaveProperty('appendSystemPrompt');
    expect(options).not.toHaveProperty('mcpServers');
    expect(options).not.toHaveProperty('resume');
  });

  it('starts the CLI without any API credential in its env', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-must-not-leak';
    process.env.ANTHROPIC_AUTH_TOKEN = 'bearer-must-not-leak';
    const fake = replay(SUCCESS);
    await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
        SESSION,
        { text: 'hi' },
        OPTIONS,
      ),
    );
    const env = fake.calls[0]?.env ?? {};
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
    expect(Object.values(env)).not.toContain('sk-must-not-leak');
  });

  it('registers brain tools as one in-process MCP server', async () => {
    const fake = replay(SUCCESS);
    await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
        SESSION,
        { text: 'hi' },
        { ...OPTIONS, tools: ECHO_TOOLS },
      ),
    );
    expect(Object.keys(fake.calls[0]?.mcpServers ?? {})).toEqual(['noot-brain']);
  });
});

describe('ClaudeEngineAdapter sessions', () => {
  it('learns the Claude session id from init and resumes it next turn', async () => {
    const handles = new SessionHandleStore();
    const adapter = new ClaudeEngineAdapter({
      queryFactory: replay(INIT, SUCCESS).factory,
      sessionHandles: handles,
    });
    await collect(adapter.startTurn(SESSION, { text: 'one' }, OPTIONS));
    expect(handles.claudeSessionIdFor('brain-session')).toBe('claude-uuid');

    const second = replay(INIT, SUCCESS);
    const resumed = new ClaudeEngineAdapter({
      queryFactory: second.factory,
      sessionHandles: handles,
    });
    await collect(resumed.startTurn(SESSION, { text: 'two' }, { ...OPTIONS, turnId: 'turn-2' }));
    expect(second.calls[0]?.resume).toBe('claude-uuid');
    expect(second.calls[0]).not.toHaveProperty('forkSession');
  });

  it('forgets a stale resume id after one failed turn and reports a single error', async () => {
    const handles = new SessionHandleStore();
    handles.remember('brain-session', 'stale-id');
    const fake = fakeQuery(async function* () {
      yield STALE_RESULT;
      throw new Error('Claude Code returned an error result: No conversation found');
    });
    const events = await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory, sessionHandles: handles }).startTurn(
        SESSION,
        { text: 'x' },
        OPTIONS,
      ),
    );
    expectWellFormedTurn(events, 'failed');
    expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
    expect(handles.claudeSessionIdFor('brain-session')).toBeUndefined();
  });

  it('keeps an established session id when a later step fails', async () => {
    const handles = new SessionHandleStore();
    handles.remember('brain-session', 'claude-uuid');
    const fake = fakeQuery(async function* () {
      yield INIT;
      throw new Error('stream died');
    });
    await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory, sessionHandles: handles }).startTurn(
        SESSION,
        { text: 'x' },
        OPTIONS,
      ),
    );
    expect(handles.claudeSessionIdFor('brain-session')).toBe('claude-uuid');
  });
});

describe('ClaudeEngineAdapter failures', () => {
  it('reports a spawn failure as error + done(failed) instead of rejecting', async () => {
    const factory: ClaudeQueryFactory = () => {
      throw new Error('Claude Code native binary not found');
    };
    const events = await collect(
      new ClaudeEngineAdapter({ queryFactory: factory }).startTurn(SESSION, { text: 'x' }, OPTIONS),
    );
    expectWellFormedTurn(events, 'failed');
    expect(events[0]).toMatchObject({
      type: 'error',
      code: 'engine_unavailable',
      message: 'Claude Code native binary not found',
    });
  });

  it('reports an unsupported tool schema as error + done(failed) without calling the SDK', async () => {
    const fake = replay(SUCCESS);
    const tools: ToolBridge = {
      ...ECHO_TOOLS,
      definitions: [
        {
          name: 'bad',
          description: 'd',
          inputSchema: { type: 'object', properties: { a: { anyOf: [] } } },
        },
      ],
    };
    const events = await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
        SESSION,
        { text: 'x' },
        { ...OPTIONS, tools },
      ),
    );
    expectWellFormedTurn(events, 'failed');
    expect(events[0]).toMatchObject({ type: 'error', message: expect.stringContaining('"bad"') });
    expect(fake.calls).toHaveLength(0);
  });

  it('closes the SDK query when the stream dies mid-tool', async () => {
    const fake = fakeQuery(async function* () {
      yield INIT;
      yield {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't', name: 'mcp__noot-brain__echo', input: {} }],
        },
        parent_tool_use_id: null,
        session_id: 'c',
      } as unknown as SDKMessage;
      throw new Error('process exited with code 1');
    });
    const events = await collect(
      new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
        SESSION,
        { text: 'x' },
        OPTIONS,
      ),
    );
    expectWellFormedTurn(events, 'failed');
    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});

describe('ClaudeEngineAdapter cancel', () => {
  function blockingQuery() {
    return fakeQuery(async function* (options) {
      yield INIT;
      await new Promise<void>((_resolve, reject) => {
        options.abortController?.signal.addEventListener(
          'abort',
          () => reject(new Error('Claude Code process aborted by user')),
          { once: true },
        );
      });
    });
  }

  it('aborts the SDK turn and ends with done(cancelled) and no error', async () => {
    const fake = blockingQuery();
    const adapter = new ClaudeEngineAdapter({ queryFactory: fake.factory });
    const stream = adapter
      .startTurn(SESSION, { text: 'slow' }, { ...OPTIONS, turnId: 'turn-cancel' })
      [Symbol.asyncIterator]();
    const events: NootEvent[] = [];
    const pump = (async () => {
      for (let next = await stream.next(); !next.done; next = await stream.next()) {
        events.push(next.value);
      }
    })();
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    await adapter.cancel('turn-cancel');
    await pump;

    expect(fake.calls[0]?.abortController?.signal.aborted).toBe(true);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expectWellFormedTurn(events, 'cancelled');
  });

  it('suppresses an error that follows a cancel inside the same SDK message', async () => {
    const usageThenError = {
      ...STALE_RESULT,
      modelUsage: {
        'claude-sonnet-5': {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0,
        },
      },
    } as unknown as SDKMessage;
    const adapter = new ClaudeEngineAdapter({ queryFactory: replay(INIT, usageThenError).factory });
    const events: NootEvent[] = [];
    for await (const event of adapter.startTurn(SESSION, { text: 'x' }, OPTIONS)) {
      events.push(event);
      if (event.type === 'usage') {
        await adapter.cancel(OPTIONS.turnId);
      }
    }
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expectWellFormedTurn(events, 'cancelled');
  });

  it('closes the SDK query when the consumer stops reading', async () => {
    const fake = replay(INIT, SUCCESS);
    const stream = new ClaudeEngineAdapter({ queryFactory: fake.factory }).startTurn(
      SESSION,
      { text: 'x' },
      OPTIONS,
    );
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('treats unknown turn ids as a no-op', async () => {
    await expect(
      new ClaudeEngineAdapter({ queryFactory: replay().factory }).cancel('nope'),
    ).resolves.toBeUndefined();
  });
});

describe('ClaudeEngineAdapter capabilities', () => {
  it('exposes harness capability flags', () => {
    expect(new ClaudeEngineAdapter({ queryFactory: replay().factory }).capabilities).toEqual({
      toolLoop: 'ownToolLoop',
      thinkingStream: true,
      sessions: true,
      choices: true,
    });
  });
});
