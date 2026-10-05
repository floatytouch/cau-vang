import { readFileSync } from 'node:fs';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { isNootEvent, type NootEvent } from '@noot/shared';
import { describe, expect, it } from 'vitest';

import { EventSequence } from '../src/event-sequence.js';
import { SdkMessageMapper } from '../src/sdk-message-mapper.js';

/** Recorded from a live claude-sonnet-5 turn (thinking -> brain tool call -> text), signatures redacted. */
const RECORDED_TOOL_TURN = JSON.parse(
  readFileSync(new URL('./fixtures/sdk-tool-turn.json', import.meta.url), 'utf8'),
) as SDKMessage[];

function mapAll(messages: SDKMessage[]): NootEvent[] {
  const mapper = new SdkMessageMapper(new EventSequence('s1', 't1'));
  return messages.flatMap((message) => mapper.mapMessage(message));
}

function streamEvent(event: Record<string, unknown>): SDKMessage {
  return {
    type: 'stream_event',
    event,
    parent_tool_use_id: null,
    uuid: 'u',
    session_id: 'c',
  } as unknown as SDKMessage;
}

function assistant(content: unknown[]): SDKMessage {
  return {
    type: 'assistant',
    message: { role: 'assistant', content },
    parent_tool_use_id: null,
    uuid: 'u',
    session_id: 'c',
  } as unknown as SDKMessage;
}

function joined(events: NootEvent[], type: 'text_delta' | 'thinking_delta'): string {
  return events.flatMap((event) => (event.type === type ? [event.text] : [])).join('');
}

describe('SdkMessageMapper on a recorded live turn', () => {
  const events = mapAll(RECORDED_TOOL_TURN);

  it('emits only valid NootEvents with contiguous seq', () => {
    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index));
  });

  it('streams thinking and text exactly once each', () => {
    expect(joined(events, 'thinking_delta')).toBe(
      "I need to check the weather for Hanoi, so I'll call the weather tool.\n\n",
    );
    expect(joined(events, 'text_delta')).toBe("It's sunny in Hanoi right now.");
    expect(events.filter((event) => event.type === 'thinking_delta').length).toBeGreaterThan(1);
  });

  it('orders one tool call start -> update -> end under the brain tool name', () => {
    const toolEvents = events.flatMap((event) => (event.type === 'tool_call' ? [event] : []));
    expect(toolEvents.map((event) => event.phase)).toEqual(['start', 'update', 'end']);
    expect(new Set(toolEvents.map((event) => event.callId))).toEqual(
      new Set(['toolu_01JNuQdBjYvDK3Jcuh1gdCZZ']),
    );
    expect(toolEvents.every((event) => event.name === 'get_weather')).toBe(true);
    expect(toolEvents[1]).toMatchObject({ args: { city: 'Hanoi' } });
    expect(toolEvents[2]).toMatchObject({ status: 'succeeded' });
  });

  it('reports usage per model from the result', () => {
    expect(events.filter((event) => event.type === 'usage')).toEqual([
      expect.objectContaining({ engine: 'claude', model: 'claude-sonnet-5', outputTokens: 112 }),
    ]);
  });
});

describe('SdkMessageMapper edge cases', () => {
  it('maps an unstreamed assistant message (no message_start) once', () => {
    const events = mapAll([assistant([{ type: 'text', text: 'synthetic' }])]);
    expect(events).toEqual([expect.objectContaining({ type: 'text_delta', text: 'synthetic' })]);
  });

  it('emits choices only for the AskUserQuestion tool', () => {
    const args = { questions: [{ question: 'Pick', options: [{ label: 'A' }] }] };
    const ask = mapAll([
      assistant([
        { type: 'tool_use', id: 'a', name: 'mcp__noot-brain__AskUserQuestion', input: args },
      ]),
    ]);
    const other = mapAll([
      assistant([{ type: 'tool_use', id: 'b', name: 'mcp__noot-brain__create_quiz', input: args }]),
    ]);
    expect(ask.map((event) => event.type)).toEqual(['tool_call', 'choices']);
    expect(other.map((event) => event.type)).toEqual(['tool_call']);
  });

  it('emits choices from streamed AskUserQuestion args at block stop', () => {
    const args = JSON.stringify({ questions: [{ options: [{ label: 'A' }, { label: 'B' }] }] });
    const events = mapAll([
      streamEvent({ type: 'message_start', message: {} }),
      streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'q',
          name: 'mcp__noot-brain__AskUserQuestion',
          input: {},
        },
      }),
      streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: args.slice(0, 10) },
      }),
      streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: args.slice(10) },
      }),
      streamEvent({ type: 'content_block_stop', index: 0 }),
    ]);
    expect(events.map((event) => event.type)).toEqual(['tool_call', 'tool_call', 'choices']);
    expect(events.every(isNootEvent)).toBe(true);
  });

  it('marks a failed tool result with the started call name', () => {
    const events = mapAll([
      assistant([{ type: 'tool_use', id: 'f', name: 'mcp__noot-brain__get_weather', input: {} }]),
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'f', is_error: true, content: 'boom' }],
        },
        parent_tool_use_id: null,
        session_id: 'c',
      } as unknown as SDKMessage,
    ]);
    expect(events.at(-1)).toMatchObject({
      phase: 'end',
      status: 'failed',
      name: 'get_weather',
      error: 'boom',
    });
  });

  it('turns an error result into an error event', () => {
    const events = mapAll([
      {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['No conversation found'],
        modelUsage: {},
        session_id: 'c',
      } as unknown as SDKMessage,
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'error_during_execution',
        message: 'No conversation found',
      }),
    ]);
  });
});
