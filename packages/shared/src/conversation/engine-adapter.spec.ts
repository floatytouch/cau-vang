import { describe, expect, it } from 'vitest';
import {
  isBareApiEngine,
  isHarnessEngine,
  type EngineAdapter,
  type EngineCapabilities,
  type EngineSession,
  type TurnOptions,
} from './engine-adapter.js';
import { isNootEvent } from './event-validation.js';
import type { NootEvent } from './events.js';

const HARNESS_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'ownToolLoop',
  thinkingStream: true,
  sessions: true,
  choices: true,
};

const BARE_API_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'bareApi',
  thinkingStream: false,
  sessions: false,
  choices: false,
};

const SESSION: EngineSession = { sessionId: 'session-1', history: [] };

const OPTIONS: TurnOptions = {
  turnId: 'turn-1',
  model: 'echo-model',
  systemPrompt: 'You are Not.',
};

/** Minimal reference adapter: proves an async generator satisfies the contract. */
function createEchoAdapter(id: string, capabilities: EngineCapabilities): EngineAdapter {
  return {
    id,
    capabilities,
    async *startTurn(session, input, options) {
      const meta = (seq: number) => ({
        sessionId: session.sessionId,
        turnId: options.turnId,
        seq,
        emittedAt: new Date().toISOString(),
      });
      yield { ...meta(0), type: 'text_delta', text: input.text } satisfies NootEvent;
      yield { ...meta(1), type: 'done', reason: 'completed' } satisfies NootEvent;
    },
    async cancel() {},
  };
}

async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('engine capabilities', () => {
  it('tells a harness engine from a bare API engine', () => {
    const harness = createEchoAdapter('claude', HARNESS_CAPABILITIES);
    const bareApi = createEchoAdapter('lumo', BARE_API_CAPABILITIES);

    expect(isHarnessEngine(harness.capabilities)).toBe(true);
    expect(isBareApiEngine(harness.capabilities)).toBe(false);
    expect(isHarnessEngine(bareApi.capabilities)).toBe(false);
    expect(isBareApiEngine(bareApi.capabilities)).toBe(true);
  });
});

describe('reference EngineAdapter', () => {
  it('streams valid envelopes that end with exactly one done', async () => {
    const adapter = createEchoAdapter('lumo', BARE_API_CAPABILITIES);

    const events = await collect(adapter.startTurn(SESSION, { text: 'hi' }, OPTIONS));

    expect(events.every(isNootEvent)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'done']);
    expect(events.map((event) => event.seq)).toEqual([0, 1]);
    expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed', turnId: 'turn-1' });
  });
});
