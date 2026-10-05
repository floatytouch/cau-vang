import type {
  EngineAdapter,
  EngineSession,
  NootEvent,
  NootEventMeta,
  TurnInput,
  TurnOptions,
} from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../../src/braincore/tools/tool-registry.js';
import { PROGRESS_STAGE } from '../../../src/braincore/usage/progress-stages.js';
import {
  runConversationTurn,
  TOOL_RESULTS_INPUT_PREFIX,
} from '../../../src/braincore/turn/turn-runner.js';

type Step = (input: TurnInput, session: EngineSession) => NootEvent[];

const META: NootEventMeta = {
  sessionId: 'engine-side',
  turnId: 'engine-side',
  seq: 99,
  emittedAt: '',
};
const OPTIONS: TurnOptions = { turnId: 'turn-1', model: 'model', systemPrompt: 'prompt' };

function bareApiAdapter(step: Step, sessions: EngineSession[] = []): EngineAdapter {
  return {
    id: 'scripted',
    capabilities: { toolLoop: 'bareApi', thinkingStream: false, sessions: false, choices: false },
    async *startTurn(session, input) {
      sessions.push(session);
      yield* step(input, session);
    },
    async cancel() {},
  };
}

const toolCall = (name: string): NootEvent => ({
  ...META,
  type: 'tool_call',
  phase: 'start',
  status: 'running',
  callId: `call-${name}`,
  name,
  args: {},
});
const text = (value: string): NootEvent => ({ ...META, type: 'text_delta', text: value });
const done = (reason: 'completed' | 'cancelled' = 'completed'): NootEvent => ({
  ...META,
  type: 'done',
  reason,
});

async function runTurn(
  adapter: EngineAdapter,
  registry = new ToolRegistry(),
): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  const session = { sessionId: 'session-1', history: [{ role: 'user' as const, text: 'earlier' }] };
  for await (const event of runConversationTurn({
    adapter,
    session,
    input: { text: 'now' },
    options: OPTIONS,
    toolRegistry: registry,
  })) {
    events.push(event);
  }
  return events;
}

describe('runConversationTurn (bare API)', () => {
  it('feeds tool results into the next step input and grows the step history', async () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'boom', description: '', inputSchema: {} }, async () => {
      throw new Error('tool exploded');
    });
    const sessions: EngineSession[] = [];
    const inputs: string[] = [];
    const adapter = bareApiAdapter((input) => {
      inputs.push(input.text);
      return input.text.startsWith(TOOL_RESULTS_INPUT_PREFIX)
        ? [text('final'), done()]
        : [text('thinking about it'), toolCall('boom'), done()];
    }, sessions);

    const events = await runTurn(adapter, registry);

    expect(events.map((event) => event.type)).toEqual([
      'progress',
      'text_delta',
      'tool_call',
      'progress',
      'tool_call',
      'text_delta',
      'progress',
      'done',
    ]);
    expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(events[0]).toMatchObject({ label: PROGRESS_STAGE.STARTING, fraction: 0 });
    expect(events[3]).toMatchObject({ label: PROGRESS_STAGE.RUNNING_TOOLS });
    expect(events[6]).toMatchObject({ label: PROGRESS_STAGE.FINISHING, fraction: 1 });
    expect(
      events.every((event) => event.turnId === 'turn-1' && event.sessionId === 'session-1'),
    ).toBe(true);
    expect(events[4]).toMatchObject({
      phase: 'end',
      status: 'failed',
      error: 'Tool boom threw: tool exploded',
    });
    const results = JSON.parse(inputs[1]!.slice(TOOL_RESULTS_INPUT_PREFIX.length)) as unknown[];
    expect(results).toEqual([
      {
        callId: 'call-boom',
        name: 'boom',
        outcome: { ok: false, error: 'Tool boom threw: tool exploded' },
      },
    ]);
    expect(sessions[1]!.history.map((message) => [message.role, message.text])).toEqual([
      ['user', 'earlier'],
      ['user', 'now'],
      ['assistant', 'thinking about it\n[tool_call boom(call-boom) {}]'],
    ]);
  });

  it('stops looping when a step ends cancelled', async () => {
    const adapter = bareApiAdapter(() => [toolCall('echo'), done('cancelled')]);
    const events = await runTurn(adapter);
    expect(events.map((event) => event.type)).toEqual([
      'progress',
      'tool_call',
      'progress',
      'done',
    ]);
    expect(events.at(-1)).toMatchObject({ reason: 'cancelled' });
  });

  it('turns a stream without done into error + done(failed)', async () => {
    const events = await runTurn(bareApiAdapter(() => [text('partial')]));
    expect(events.map((event) => event.type)).toEqual(['progress', 'text_delta', 'error', 'done']);
    expect(events.at(-1)).toMatchObject({ reason: 'failed', seq: 3 });
  });

  it('fails the turn once the step cap is hit, with a single done', async () => {
    const events = await runTurn(bareApiAdapter(() => [toolCall('missing'), done()]));
    expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
    expect(events.at(-2)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/exceeded/),
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'failed' });
    expect(events[0]).toMatchObject({ type: 'progress', label: PROGRESS_STAGE.STARTING });
  });
});
