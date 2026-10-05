import { describe, expect, it } from 'vitest';
import { isNootEvent, parseNootEvent } from '../../src/conversation/event-validation.js';
import { isTerminalEvent, type NootEvent } from '../../src/conversation/events.js';

const META = {
  sessionId: 'session-1',
  turnId: 'turn-1',
  seq: 0,
  emittedAt: '2026-01-01T00:00:00.000Z',
};

const VALID_EVENTS: Record<string, NootEvent> = {
  text_delta: { ...META, type: 'text_delta', text: 'Hello' },
  thinking_delta: { ...META, type: 'thinking_delta', text: 'Considering...' },
  'tool_call start': {
    ...META,
    type: 'tool_call',
    phase: 'start',
    callId: 'call-1',
    name: 'read_file',
    status: 'running',
    args: { path: 'notes.md' },
  },
  'tool_call update': {
    ...META,
    type: 'tool_call',
    phase: 'update',
    callId: 'call-1',
    name: 'read_file',
    status: 'running',
    message: 'reading',
  },
  'tool_call end': {
    ...META,
    type: 'tool_call',
    phase: 'end',
    callId: 'call-1',
    name: 'read_file',
    status: 'succeeded',
    result: 'file contents',
  },
  'tool_call blocked': {
    ...META,
    type: 'tool_call',
    phase: 'end',
    callId: 'call-2',
    name: 'write_file',
    status: 'blocked',
    error: 'plan mode refuses mutating tools',
  },
  choices: {
    ...META,
    type: 'choices',
    prompt: 'Pick one',
    options: [
      { id: 'a', label: 'Option A' },
      { id: 'b', label: 'Option B', description: 'second' },
    ],
  },
  progress: { ...META, type: 'progress', label: 'Searching', fraction: 0.5 },
  usage: {
    ...META,
    type: 'usage',
    engine: 'claude',
    model: 'some-model',
    inputTokens: 120,
    outputTokens: 40,
    cacheReadTokens: 0,
    costUsd: 0.0012,
  },
  done: { ...META, type: 'done', reason: 'completed' },
  error: {
    ...META,
    type: 'error',
    code: 'engine_unavailable',
    message: 'timeout',
    recoverable: true,
  },
  internal_note: { ...META, type: 'internal_note', source: 'job-42', text: 'Build finished' },
};

function withField(base: NootEvent, field: string, value: unknown): unknown {
  return { ...base, [field]: value };
}

function withoutField(base: NootEvent, field: string): unknown {
  const copy: Record<string, unknown> = { ...base };
  delete copy[field];
  return copy;
}

function expectRejected(value: unknown, errorFragment: string): void {
  const result = parseNootEvent(value);
  expect(result.ok).toBe(false);
  expect(result.ok ? '' : result.error).toContain(errorFragment);
  expect(isNootEvent(value)).toBe(false);
}

describe('parseNootEvent', () => {
  it.each(Object.entries(VALID_EVENTS))('accepts a valid %s event', (_label, event) => {
    expect(parseNootEvent(event)).toEqual({ ok: true, event });
    expect(isNootEvent(event)).toBe(true);
  });

  it('accepts an event after a JSON round trip, as it arrives over WS', () => {
    for (const event of Object.values(VALID_EVENTS)) {
      expect(isNootEvent(JSON.parse(JSON.stringify(event)))).toBe(true);
    }
  });

  it('tolerates unknown extra fields', () => {
    expect(isNootEvent(withField(VALID_EVENTS['done']!, 'futureField', 1))).toBe(true);
  });

  it.each([null, undefined, 'done', 42, [VALID_EVENTS['done']]])(
    'rejects non-object %j',
    (value) => {
      expectRejected(value, 'event must be an object');
    },
  );

  it('rejects an unknown or missing type', () => {
    expectRejected(withField(VALID_EVENTS['done']!, 'type', 'shout'), 'event.type must be one of');
    expectRejected(withoutField(VALID_EVENTS['done']!, 'type'), 'got undefined');
  });

  it.each(['sessionId', 'turnId', 'seq', 'emittedAt'])('rejects a missing %s', (field) => {
    expectRejected(withoutField(VALID_EVENTS['text_delta']!, field), `text_delta.${field}`);
  });

  it('rejects bad metadata values', () => {
    const textDelta = VALID_EVENTS['text_delta']!;
    expectRejected(withField(textDelta, 'sessionId', ''), 'sessionId must be a non-empty string');
    expectRejected(withField(textDelta, 'seq', -1), 'seq must be a non-negative integer');
    expectRejected(withField(textDelta, 'seq', 1.5), 'seq must be a non-negative integer');
    expectRejected(
      withField(textDelta, 'emittedAt', 'yesterday'),
      'emittedAt must be an ISO-8601 timestamp',
    );
  });

  it.each([
    'yesterday',
    '1',
    'Jan 1 2026',
    '2026-01-01',
    '2026-01-01T00:00:00',
    '2026-13-01T00:00:00Z',
  ])('rejects a loose emittedAt %j', (emittedAt) => {
    expectRejected(
      withField(VALID_EVENTS['text_delta']!, 'emittedAt', emittedAt),
      'emittedAt must be an ISO-8601 timestamp',
    );
  });

  it('accepts an emittedAt with a numeric offset', () => {
    expect(
      isNootEvent(withField(VALID_EVENTS['text_delta']!, 'emittedAt', '2026-01-01T07:00:00+07:00')),
    ).toBe(true);
  });

  it('rejects a delta without text', () => {
    expectRejected(
      withoutField(VALID_EVENTS['thinking_delta']!, 'text'),
      'thinking_delta.text must be a string',
    );
  });

  describe('tool_call', () => {
    const start = VALID_EVENTS['tool_call start']!;
    const end = VALID_EVENTS['tool_call end']!;

    it('rejects an unknown phase', () => {
      expectRejected(
        withField(start, 'phase', 'middle'),
        'tool_call.phase must be one of start, update, end',
      );
    });

    it('rejects a start without args or callId', () => {
      expectRejected(withoutField(start, 'args'), 'tool_call(start).args must be present');
      expectRejected(withoutField(start, 'callId'), 'tool_call.callId must be a non-empty string');
    });

    it('rejects a status that does not match the phase', () => {
      expectRejected(
        withField(start, 'status', 'succeeded'),
        'tool_call(start).status must be one of running',
      );
      expectRejected(
        withField(end, 'status', 'running'),
        'tool_call(end).status must be one of succeeded',
      );
    });

    it('rejects a non-string error message', () => {
      expectRejected(
        withField(end, 'error', { reason: 'x' }),
        'tool_call(end).error must be a string',
      );
    });
  });

  describe('choices', () => {
    const choices = VALID_EVENTS['choices']!;

    it('rejects missing or empty options', () => {
      expectRejected(withoutField(choices, 'options'), 'choices.options must be a non-empty array');
      expectRejected(
        withField(choices, 'options', []),
        'choices.options must be a non-empty array',
      );
    });

    it('rejects a malformed option', () => {
      expectRejected(withField(choices, 'options', ['a']), 'choices.options[0] must be an object');
      expectRejected(
        withField(choices, 'options', [{ id: 'a' }]),
        'choices.options[0].label must be a non-empty string',
      );
    });

    it('rejects duplicate option ids', () => {
      const duplicated = [
        { id: 'a', label: 'One' },
        { id: 'a', label: 'Two' },
      ];
      expectRejected(withField(choices, 'options', duplicated), 'choices.options[1].id duplicates');
    });

    it('rejects a non-string prompt', () => {
      expectRejected(withField(choices, 'prompt', 3), 'choices.prompt must be a string');
    });
  });

  it('rejects a progress fraction outside 0..1', () => {
    expectRejected(
      withField(VALID_EVENTS['progress']!, 'fraction', 1.2),
      'progress.fraction must be a number between 0 and 1',
    );
  });

  it('rejects negative or fractional token counts and negative cost', () => {
    const usage = VALID_EVENTS['usage']!;
    expectRejected(
      withField(usage, 'inputTokens', -5),
      'usage.inputTokens must be a non-negative integer',
    );
    expectRejected(
      withField(usage, 'outputTokens', 2.5),
      'usage.outputTokens must be a non-negative integer',
    );
    expectRejected(
      withField(usage, 'costUsd', -1),
      'usage.costUsd must be a finite non-negative number',
    );
  });

  it('rejects an unknown done reason', () => {
    expectRejected(
      withField(VALID_EVENTS['done']!, 'reason', 'bored'),
      'done.reason must be one of',
    );
  });

  it('rejects an error without recoverable flag', () => {
    expectRejected(
      withoutField(VALID_EVENTS['error']!, 'recoverable'),
      'error.recoverable must be a boolean',
    );
  });

  it('rejects an internal note without source', () => {
    expectRejected(
      withoutField(VALID_EVENTS['internal_note']!, 'source'),
      'internal_note.source must be a non-empty string',
    );
  });
});

describe('isTerminalEvent', () => {
  it('is true only for done', () => {
    const terminalTypes = Object.values(VALID_EVENTS)
      .filter(isTerminalEvent)
      .map((event) => event.type);
    expect(terminalTypes).toEqual(['done']);
  });
});
