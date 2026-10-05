import {
  DONE_REASON_COMPLETED,
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
} from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { chatReducer, createInitialChatState } from '../../src/chat/chat-state.js';

describe('chatReducer', () => {
  it('accumulates stream text, thinking, choices and marks the turn done', () => {
    let state = createInitialChatState('mock', 'mock-model');
    state = chatReducer(state, {
      type: 'session/loaded',
      sessionId: 's1',
      engineId: 'mock',
      model: 'mock-model',
      mode: 'auto',
      history: [],
    });
    state = chatReducer(state, { type: 'turn/local-user', text: 'hi' });
    state = chatReducer(state, {
      type: 'turn/event',
      event: {
        type: NOOT_EVENT_TYPE_THINKING_DELTA,
        text: 'hmm',
        sessionId: 's1',
        turnId: 't1',
        seq: 0,
        emittedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    state = chatReducer(state, {
      type: 'turn/event',
      event: {
        type: NOOT_EVENT_TYPE_TEXT_DELTA,
        text: 'hello',
        sessionId: 's1',
        turnId: 't1',
        seq: 1,
        emittedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    state = chatReducer(state, {
      type: 'turn/event',
      event: {
        type: NOOT_EVENT_TYPE_CHOICES,
        prompt: 'Pick',
        options: [{ id: 'a', label: 'A' }],
        sessionId: 's1',
        turnId: 't1',
        seq: 2,
        emittedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    state = chatReducer(state, {
      type: 'turn/event',
      event: {
        type: NOOT_EVENT_TYPE_DONE,
        reason: DONE_REASON_COMPLETED,
        sessionId: 's1',
        turnId: 't1',
        seq: 3,
        emittedAt: '2026-10-05T00:00:00.000Z',
      },
    });

    expect(state.turn?.thinking).toBe('hmm');
    expect(state.choices).toEqual([{ id: 'a', label: 'A' }]);
    expect(state.streaming).toBe(false);
    expect(state.history.map((item) => item.text)).toEqual(['hi', 'hello']);
  });

  it('retires earlier choices once the user sends a new message', () => {
    let state = createInitialChatState('mock', 'mock-model');
    state = chatReducer(state, {
      type: 'session/loaded',
      sessionId: 's1',
      engineId: 'mock',
      model: 'mock-model',
      mode: 'auto',
      history: [],
    });
    state = chatReducer(state, {
      type: 'turn/event',
      event: {
        type: NOOT_EVENT_TYPE_CHOICES,
        prompt: 'Pick',
        options: [{ id: 'a', label: 'A' }],
        sessionId: 's1',
        turnId: 't1',
        seq: 0,
        emittedAt: '2026-10-05T00:00:00.000Z',
      },
    });
    expect(state.choicesConsumed).toBe(false);
    state = chatReducer(state, { type: 'turn/local-user', text: 'typed instead' });
    expect(state.choicesConsumed).toBe(true);
  });
});
