import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isNootEvent, type EngineAdapter, type NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../src/config/app-config.js';
import {
  BraincoreService,
  BRAINCORE_EVENT_CHANNEL,
} from '../../src/braincore/braincore.service.js';
import {
  IDENTITY_CONFIG_FILE,
  renderBotNameClause,
} from '../../src/braincore/identity/identity-builder.js';
import type { StoredSession } from '../../src/braincore/session/session-types.js';
import {
  MOCK_ENGINE_ID,
  MOCK_HARNESS_ENGINE_ID,
  MOCK_USE_ECHO_TOOL_MARKER,
} from '../../src/braincore/testing/mock-engine-adapter.js';

const RENAME_ANCHOR = 'You are Noops.';

async function startService(dataDir: string): Promise<BraincoreService> {
  const service = new BraincoreService({
    dataDir,
    identityConfigDir: DEFAULT_IDENTITY_CONFIG_DIR,
    registerMocks: true,
  });
  await service.initialize();
  return service;
}

function collectEvents(service: BraincoreService): NootEvent[] {
  const collected: NootEvent[] = [];
  service.on(BRAINCORE_EVENT_CHANNEL, (event: NootEvent) => collected.push(event));
  return collected;
}

describe('BrainCore funnel', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-3-funnel-'));
    service = await startService(tempDataDir);
  });

  afterEach(async () => {
    service.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('runs one tool-using turn with gap-free seq, exactly one trailing done, and disk history', async () => {
    const sessions: StoredSession[] = [];
    for (let index = 0; index < 4; index += 1) {
      sessions.push(await service.createSession(MOCK_ENGINE_ID, 'mock-model', `chat-${index}`));
    }
    const [evicted, , , active] = sessions;
    expect(service.sessions.liveSessionIds()).toEqual(sessions.slice(1).map((s) => s.id));

    const collected = collectEvents(service);
    await service.sendUserMessage(active!.id, `hello ${MOCK_USE_ECHO_TOOL_MARKER}`);

    expect(collected.every(isNootEvent)).toBe(true);
    expect(collected.map((event) => event.seq)).toEqual(collected.map((_, index) => index));
    expect(new Set(collected.map((event) => event.turnId)).size).toBe(1);
    expect(collected.map((event) => event.type)).toEqual([
      'thinking_delta',
      'tool_call',
      'tool_call',
      'text_delta',
      'done',
    ]);
    expect(collected[2]).toMatchObject({ phase: 'end', status: 'succeeded' });
    expect(collected.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });

    const stored = JSON.parse(
      await readFile(path.join(tempDataDir, 'conversations', `${active!.id}.json`), 'utf8'),
    ) as StoredSession;
    expect(stored.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(stored.messages[1]?.text).toContain('from-mock');
    expect(service.sessions.liveSessionIds()).not.toContain(evicted!.id);
  });

  it('keeps history across LRU eviction and a restart', async () => {
    const first = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.sendUserMessage(first.id, 'remember me');
    for (let index = 0; index < 3; index += 1) {
      await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    }
    expect(service.sessions.liveSessionIds()).not.toContain(first.id);
    expect(service.getHistory(first.id)).toHaveLength(2);

    const restarted = await startService(tempDataDir);
    expect(restarted.getHistory(first.id).map((message) => message.text)).toEqual([
      'remember me',
      'remember me',
    ]);
  });

  it('keeps history when switching engines and sends the prior turns to the new engine', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.sendUserMessage(session.id, 'first message');

    await service.setEngine(session.id, MOCK_HARNESS_ENGINE_ID, 'harness-model');
    const seenHistory: string[][] = [];
    const harness = service.engines.get(MOCK_HARNESS_ENGINE_ID);
    const originalStart = harness.startTurn.bind(harness);
    (harness as { startTurn: EngineAdapter['startTurn'] }).startTurn = (
      engineSession,
      input,
      options,
    ) => {
      seenHistory.push(engineSession.history.map((message) => message.text));
      return originalStart(engineSession, input, options);
    };
    await service.sendUserMessage(session.id, 'second message');

    expect(seenHistory).toEqual([['first message', 'first message']]);
    const roles = service.getHistory(session.id).map((message) => message.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('records internal turns as internal and emits them as a note turn ending in done', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const collected = collectEvents(service);
    await service.postInternalTurn(session.id, 'async-job', 'background result');

    expect(service.getHistory(session.id).map((message) => message.role)).toEqual(['internal']);
    expect(service.sessions.conversationMessages(session.id)).toEqual([]);
    expect(collected.map((event) => [event.type, event.seq])).toEqual([
      ['internal_note', 0],
      ['done', 1],
    ]);
  });

  it('exposes a user-settable botName that reshapes the system prompt sent to the engine', async () => {
    expect(service.getBotName()).toBe('Noops');
    const identityDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-3-rename-'));
    try {
      await writeFile(
        path.join(identityDir, IDENTITY_CONFIG_FILE),
        JSON.stringify({ baseSystemPromptAnchor: RENAME_ANCHOR, botName: 'Noops' }),
      );
      const renamed = new BraincoreService({
        dataDir: tempDataDir,
        identityConfigDir: identityDir,
        registerMocks: true,
      });
      await renamed.initialize();
      const seenPrompts: string[] = [];
      const engine = renamed.engines.get(MOCK_ENGINE_ID);
      const originalStart = engine.startTurn.bind(engine);
      (engine as { startTurn: EngineAdapter['startTurn'] }).startTurn = (
        engineSession,
        input,
        options,
      ) => {
        seenPrompts.push(options.systemPrompt);
        return originalStart(engineSession, input, options);
      };
      const session = await renamed.createSession(MOCK_ENGINE_ID, 'mock-model');

      await renamed.sendUserMessage(session.id, 'before rename');
      await expect(renamed.setBotName('Nốt')).resolves.toBe('Nốt');
      await renamed.sendUserMessage(session.id, 'after rename');

      expect(renamed.getBotName()).toBe('Nốt');
      expect(seenPrompts).toEqual([RENAME_ANCHOR, RENAME_ANCHOR + renderBotNameClause('Nốt')]);
    } finally {
      await rm(identityDir, { recursive: true, force: true });
    }
  });

  it('rejects a second concurrent turn on the same session', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const first = service.sendUserMessage(session.id, 'one');
    await expect(service.sendUserMessage(session.id, 'two')).rejects.toThrow(/running turn/);
    await first;
    await expect(service.sendUserMessage(session.id, 'three')).resolves.toBeTypeOf('string');
  });

  it('surfaces an engine failure as error + done(failed) and frees the session', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const engine = service.engines.get(MOCK_ENGINE_ID) as { startTurn: EngineAdapter['startTurn'] };
    engine.startTurn = () => {
      throw new Error('engine exploded');
    };
    const collected = collectEvents(service);
    await service.sendUserMessage(session.id, 'boom');

    expect(collected.map((event) => event.type)).toEqual(['error', 'done']);
    expect(collected[0]).toMatchObject({ message: 'engine exploded', seq: 0 });
    expect(collected[1]).toMatchObject({ reason: 'failed', seq: 1 });
    expect(service.sessions.beginTurn(session.id)).toBe(true);
  });
});
