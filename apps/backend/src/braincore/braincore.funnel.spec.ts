import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isNootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveIdentityConfigDir } from './braincore-paths.js';
import { BraincoreService, BRAINCORE_EVENT_CHANNEL } from './braincore.service.js';
import { MOCK_USE_ECHO_TOOL_MARKER, type StoredSession } from './session/session-types.js';
import { MOCK_ENGINE_ID, MOCK_HARNESS_ENGINE_ID } from './testing/mock-engine-adapter.js';
import type { NootEvent } from '@noot/shared';

describe('BrainCore funnel', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-braincore-'));
    service = new BraincoreService({
      dataDir: tempDataDir,
      identityConfigDir: resolveIdentityConfigDir(),
    });
    await service.initialize();
  });

  afterEach(async () => {
    service.removeAllListeners();
  });

  it('runs one turn through MockAdapter with ordered WS events, disk history, and LRU eviction', async () => {
    const collected: unknown[] = [];
    service.on(BRAINCORE_EVENT_CHANNEL, (event: NootEvent) => {
      collected.push(event);
    });

    const sessions: StoredSession[] = [];
    for (let index = 0; index < 4; index += 1) {
      const created = await service.createSession(MOCK_ENGINE_ID, 'mock-model', `chat-${index}`);
      sessions.push(created);
      service.sessions.touchSession(created.id);
    }

    const evictedSession = sessions[0];
    const activeSession = sessions[3];
    if (!evictedSession || !activeSession) {
      throw new Error('expected four created sessions');
    }

    expect(service.sessions.liveSessionIds()).toHaveLength(3);
    expect(service.sessions.liveSessionIds()).not.toContain(evictedSession.id);

    await service.sendUserMessage(activeSession.id, `hello ${MOCK_USE_ECHO_TOOL_MARKER}`);

    expect(collected.every(isNootEvent)).toBe(true);
    const sequences = collected.map((event) => (event as NootEvent).seq);
    for (let index = 1; index < sequences.length; index += 1) {
      const previous = sequences[index - 1];
      const current = sequences[index];
      expect(current).toBeGreaterThan(previous ?? -1);
    }
    expect(collected.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });

    const history = service.getHistory(activeSession.id);
    expect(history.some((message) => message.role === 'user')).toBe(true);
    expect(history.some((message) => message.role === 'assistant')).toBe(true);

    const storedRaw = await readFile(
      path.join(tempDataDir, 'conversations', `${activeSession.id}.json`),
      'utf8',
    );
    expect(storedRaw).toContain(activeSession.id);
  });

  it('keeps history when switching engines mid conversation', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.sendUserMessage(session.id, 'first message');

    await service.setEngine(session.id, MOCK_HARNESS_ENGINE_ID, 'harness-model');
    await service.sendUserMessage(session.id, 'second message');

    const history = service.getHistory(session.id);
    expect(history.filter((message) => message.role === 'user')).toHaveLength(2);
    expect(history.filter((message) => message.role === 'assistant')).toHaveLength(2);
  });

  it('records internal turns separately from typed user messages', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.postInternalTurn(session.id, 'async-job', 'background result');

    const history = service.getHistory(session.id);
    expect(history).toHaveLength(1);
    const internalMessage = history[0];
    expect(internalMessage?.role).toBe('internal');
  });
});

describe('BrainCore SDK import guard', () => {
  it('has no engine SDK imports under braincore', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const braincoreRoot = path.dirname(new URL(import.meta.url).pathname);
    const forbidden =
      /@anthropic-ai|claude-agent|@cursor\/sdk|from 'openai'|@google\/generative-ai/;

    async function collectTypeScriptFiles(directory: string): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await collectTypeScriptFiles(fullPath)));
          continue;
        }
        if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = await collectTypeScriptFiles(braincoreRoot);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      expect(content, file).not.toMatch(forbidden);
    }
  });
});
