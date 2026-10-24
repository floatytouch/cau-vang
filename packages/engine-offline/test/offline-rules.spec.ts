import { describe, expect, it } from 'vitest';
import { isBareApiEngine, isNootEvent, OFFLINE_RULES_ENGINE_ID } from '@noot/shared';
import type { NootEvent } from '@noot/shared';
import {
  createOfflineRulesAdapter,
  formatOfflineEcho,
  OFFLINE_RULES_CAPABILITIES,
  OFFLINE_RULES_SHOW_CHOICES_MARKER,
} from '../src/index.js';

const SESSION = { sessionId: 's-offline', history: [] };
const TURN_OPTIONS = { turnId: 't-offline', model: 'rules', systemPrompt: 'You are Not.' };

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('offline rules engine', () => {
  it('declares bareApi with choices and no thinking stream', () => {
    expect(OFFLINE_RULES_CAPABILITIES).toEqual({
      toolLoop: 'bareApi',
      thinkingStream: false,
      sessions: false,
      choices: true,
    });
    expect(isBareApiEngine(OFFLINE_RULES_CAPABILITIES)).toBe(true);
  });

  it('echoes user text and completes with zero usage', async () => {
    const adapter = createOfflineRulesAdapter();
    expect(adapter.id).toBe(OFFLINE_RULES_ENGINE_ID);

    const events = await collect(
      adapter.startTurn(SESSION, { text: 'hello offline' }, TURN_OPTIONS),
    );

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'usage', 'done']);
    expect(events[0]).toMatchObject({ text: 'echo: hello offline' });
    expect(events[1]).toMatchObject({
      engine: OFFLINE_RULES_ENGINE_ID,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
    expect(events.at(-1)).toMatchObject({ reason: 'completed' });
  });

  it('emits fixture choices when the marker is present', async () => {
    const adapter = createOfflineRulesAdapter();
    const events = await collect(
      adapter.startTurn(
        SESSION,
        { text: `please ${OFFLINE_RULES_SHOW_CHOICES_MARKER}` },
        TURN_OPTIONS,
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      'text_delta',
      'choices',
      'usage',
      'done',
    ]);
    expect(events[1]).toMatchObject({
      prompt: 'Pick one',
      options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }],
    });
  });

  it('truncates long echo text', () => {
    const long = 'x'.repeat(50);
    const formatted = formatOfflineEcho(long, 20);
    expect(formatted).toBe(`echo: ${'x'.repeat(19)}...`);
  });
});
