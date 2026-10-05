import type { Run, SDKMessage } from '@cursor/sdk';
import type { NootEvent } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { createCursorEngineAdapter } from './cursor-engine-adapter.js';
import {
  collect,
  createMockAgent,
  createMockRun,
  eventTypes,
  TURN_OPTIONS,
  type MockRunScript,
} from './testing/mock-cursor-sdk.js';

const SESSION = { sessionId: 's1', history: [] };
const THINKING: SDKMessage = { type: 'thinking', agent_id: 'a', run_id: 'r', text: 'slow' };
const TOOL_RUNNING: SDKMessage = {
  type: 'tool_call',
  agent_id: 'a',
  run_id: 'r',
  call_id: 'c1',
  name: 'shell',
  status: 'running',
  args: {},
};

function adapterFor(send: () => Promise<Run>, turnTimeoutMs = 60_000) {
  const { agent } = createMockAgent(send);
  return createCursorEngineAdapter(
    { cwd: '/tmp', apiKey: 'cursor_test', turnTimeoutMs },
    { createAgent: async () => agent },
  );
}

async function firstEventThenRest(
  stream: AsyncIterable<NootEvent>,
  midTurn: () => Promise<void>,
): Promise<NootEvent[]> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  await midTurn();
  const rest = await collect({ [Symbol.asyncIterator]: () => iterator });
  return [first.value as NootEvent, ...rest];
}

function heldRun(script: MockRunScript = {}) {
  return createMockRun({ messages: [THINKING], holdOpen: true, ...script });
}

describe('cursor turn cancel and timeout', () => {
  it('cancel mid-turn stops the run once and ends with done(cancelled)', async () => {
    const run = heldRun();
    const adapter = adapterFor(async () => run);

    const events = await firstEventThenRest(
      adapter.startTurn(SESSION, { text: 'go' }, TURN_OPTIONS),
      async () => {
        await Promise.all([
          adapter.cancel(TURN_OPTIONS.turnId),
          adapter.cancel(TURN_OPTIONS.turnId),
        ]);
      },
    );

    expect(eventTypes(events)).toEqual(['thinking_delta', 'done']);
    expect(events.at(-1)).toMatchObject({ reason: 'cancelled' });
    expect(run.cancelCalls).toBe(1);
  });

  it('cancel before the run starts ends the turn and cancels the late run', async () => {
    const run = heldRun();
    let deliverRun: (value: Run) => void = () => {};
    const adapter = adapterFor(() => new Promise<Run>((resolve) => (deliverRun = resolve)));

    const pending = collect(adapter.startTurn(SESSION, { text: 'go' }, TURN_OPTIONS));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await adapter.cancel(TURN_OPTIONS.turnId);
    const events = await pending;
    deliverRun(run);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(eventTypes(events)).toEqual(['done']);
    expect(events[0]).toMatchObject({ reason: 'cancelled' });
    expect(run.cancelCalls).toBe(1);
  });

  it('cancel that lands while the delivered run is not yet attached still stops it', async () => {
    const run = heldRun();
    const adapter = adapterFor(async () => run);

    const iterator = adapter
      .startTurn(SESSION, { text: 'go' }, TURN_OPTIONS)
      [Symbol.asyncIterator]();
    const first = iterator.next();
    await adapter.cancel(TURN_OPTIONS.turnId);
    const events = [(await first).value as NootEvent];
    events.push(...(await collect({ [Symbol.asyncIterator]: () => iterator })));

    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'cancelled' });
    expect(run.cancelCalls).toBe(1);
  });

  it('timeout during a tool call reports timeout, closes the tool, and kills the run', async () => {
    const run = heldRun({ messages: [TOOL_RUNNING] });
    const adapter = adapterFor(async () => run, 20);

    const events = await collect(adapter.startTurn(SESSION, { text: 'go' }, TURN_OPTIONS));

    expect(eventTypes(events)).toEqual(['tool_call', 'error', 'tool_call', 'done']);
    expect(events[1]).toMatchObject({ code: 'timeout' });
    expect(events[2]).toMatchObject({ phase: 'end', status: 'failed' });
    expect(events.at(-1)).toMatchObject({ reason: 'failed' });
    expect(run.cancelCalls).toBe(1);
  });

  it('a consumer that stops reading cancels the run instead of leaving it running', async () => {
    const run = heldRun();
    const adapter = adapterFor(async () => run);

    const iterator = adapter
      .startTurn(SESSION, { text: 'go' }, TURN_OPTIONS)
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();

    expect(run.cancelCalls).toBe(1);
    expect(run.status).toBe('cancelled');
  });

  it('reports a cancel the SDK rejects instead of crashing on it', async () => {
    const run = heldRun({ cancelError: new Error('cancel rpc failed'), holdOpen: false });
    const adapter = adapterFor(async () => run, 5);

    const events = await firstEventThenRest(
      adapter.startTurn(SESSION, { text: 'go' }, TURN_OPTIONS),
      () => new Promise((resolve) => setTimeout(resolve, 20)),
    );

    expect(eventTypes(events)).toEqual(['thinking_delta', 'error', 'error', 'done']);
    expect(events[1]).toMatchObject({ code: 'timeout' });
    expect(events[2]).toMatchObject({
      code: 'cancel_failed',
      message: expect.stringContaining('cancel rpc failed'),
    });
    expect(events.at(-1)).toMatchObject({ reason: 'failed' });
  });
});
