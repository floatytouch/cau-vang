import { describe, expect, it } from 'vitest';
import { createToolCallTracker, mapSdkMessageToNootEvents } from '../src/sdk-message-mapper.js';
import { TurnEventBuilder } from '../src/turn-event-builder.js';

const model = 'composer-2.5';

describe('mapSdkMessageToNootEvents', () => {
  it('maps thinking text to thinking_delta', () => {
    const builder = new TurnEventBuilder('session-1', 'turn-1');
    const events = mapSdkMessageToNootEvents(
      {
        type: 'thinking',
        agent_id: 'a1',
        run_id: 'r1',
        text: 'planning',
      },
      builder,
      model,
      createToolCallTracker(),
    );

    expect(events).toEqual([
      {
        sessionId: 'session-1',
        turnId: 'turn-1',
        seq: 0,
        emittedAt: expect.any(String),
        type: 'thinking_delta',
        text: 'planning',
      },
    ]);
  });

  it('maps tool_call lifecycle to tool_call envelopes', () => {
    const builder = new TurnEventBuilder('session-1', 'turn-1');
    const tracker = createToolCallTracker();
    const start = mapSdkMessageToNootEvents(
      {
        type: 'tool_call',
        agent_id: 'a1',
        run_id: 'r1',
        call_id: 'c1',
        name: 'read',
        status: 'running',
        args: { path: 'x.ts' },
      },
      builder,
      model,
      tracker,
    );
    const end = mapSdkMessageToNootEvents(
      {
        type: 'tool_call',
        agent_id: 'a1',
        run_id: 'r1',
        call_id: 'c1',
        name: 'read',
        status: 'completed',
        result: 'ok',
      },
      builder,
      model,
      tracker,
    );

    expect(start[0]).toMatchObject({
      type: 'tool_call',
      phase: 'start',
      status: 'running',
      callId: 'c1',
    });
    expect(end[0]).toMatchObject({
      type: 'tool_call',
      phase: 'end',
      status: 'succeeded',
      callId: 'c1',
    });
  });

  it('maps assistant text blocks to text_delta', () => {
    const builder = new TurnEventBuilder('session-1', 'turn-1');
    const events = mapSdkMessageToNootEvents(
      {
        type: 'assistant',
        agent_id: 'a1',
        run_id: 'r1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
        },
      },
      builder,
      model,
      createToolCallTracker(),
    );

    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'hello' });
  });

  it('keeps the SDK failure text on a failed tool call', () => {
    const events = mapSdkMessageToNootEvents(
      {
        type: 'tool_call',
        agent_id: 'a1',
        run_id: 'r1',
        call_id: 'c2',
        name: 'shell',
        status: 'error',
        result: 'command not found: foo',
      },
      new TurnEventBuilder('session-1', 'turn-1'),
      model,
      createToolCallTracker(),
    );

    expect(events.map((event) => event.type)).toEqual(['tool_call', 'tool_call']);
    expect(events[1]).toMatchObject({
      phase: 'end',
      status: 'failed',
      error: 'command not found: foo',
    });
  });
});
