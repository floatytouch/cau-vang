import { describe, expect, it } from 'vitest';
import { chatReducer, createInitialChatState } from './chat-state.js';

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
        type: 'thinking_delta',
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
        type: 'text_delta',
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
        type: 'choices',
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
        type: 'done',
        reason: 'completed',
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

  it('keeps history when only the engine fields change', () => {
    let state = createInitialChatState('mock', 'mock-model');
    state = chatReducer(state, {
      type: 'session/loaded',
      sessionId: 's1',
      engineId: 'mock',
      model: 'mock-model',
      mode: 'plan',
      history: [{ role: 'user', text: 'keep me', ts: 't' }],
    });
    state = chatReducer(state, { type: 'engine/set', engineId: 'mock-harness', model: 'm2' });
    expect(state.history).toEqual([{ role: 'user', text: 'keep me', ts: 't' }]);
    expect(state.engineId).toBe('mock-harness');
    expect(state.model).toBe('m2');
    expect(state.mode).toBe('plan');
  });
});
