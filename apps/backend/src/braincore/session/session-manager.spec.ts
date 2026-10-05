import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionManager } from './session-manager.js';
import type { StoredSession } from './session-types.js';

describe('SessionManager', () => {
  let dataDir: string;
  let conversationsDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-3-sessions-'));
    conversationsDir = path.join(dataDir, 'conversations');
    manager = new SessionManager({ dataDir });
    await manager.initialize();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  async function createMany(count: number): Promise<StoredSession[]> {
    const created: StoredSession[] = [];
    for (let index = 0; index < count; index += 1) {
      created.push(await manager.createSession('mock', 'model'));
    }
    return created;
  }

  it('evicts the least recently used session, honouring touches', async () => {
    const [first, second, third, fourth] = await createMany(4);
    expect(manager.liveSessionIds()).toEqual([second!.id, third!.id, fourth!.id]);

    manager.touchSession(second!.id);
    manager.touchSession(first!.id);
    expect(manager.liveSessionIds()).toEqual([fourth!.id, second!.id, first!.id]);
  });

  it('never evicts a session with a running turn', async () => {
    const [first, second, third] = await createMany(3);
    expect(manager.beginTurn(first!.id)).toBe(true);
    manager.touchSession(second!.id);
    manager.touchSession(third!.id);

    const [fourth] = await createMany(1);
    expect(manager.liveSessionIds()).toEqual([first!.id, third!.id, fourth!.id]);
    expect(manager.beginTurn(first!.id)).toBe(false);
  });

  it('skips corrupt, foreign and traversal-id files on restart and keeps the valid ones', async () => {
    const [valid] = await createMany(1);
    await manager.appendMessage(valid!.id, 'user', 'kept');
    const traversal = { ...valid!, id: '../../escaped' };
    await writeFile(path.join(conversationsDir, 'broken.json'), '{not json');
    await writeFile(path.join(conversationsDir, 'traversal.json'), JSON.stringify(traversal));
    await writeFile(
      path.join(conversationsDir, '00000000-0000-0000-0000-000000000000.json'),
      JSON.stringify({ ...valid!, id: '00000000-0000-0000-0000-000000000000', messages: 'x' }),
    );

    const restarted = new SessionManager({ dataDir });
    await restarted.initialize();
    expect(restarted.listSessions().map((summary) => summary.id)).toEqual([valid!.id]);
    expect(restarted.getHistory(valid!.id).map((message) => message.text)).toEqual(['kept']);
  });

  it('lands the newest snapshot when writes of one session race', async () => {
    const [session] = await createMany(1);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        manager.appendMessage(session!.id, 'user', `message-${index}`),
      ),
    );
    const stored = JSON.parse(
      await readFile(path.join(conversationsDir, `${session!.id}.json`), 'utf8'),
    ) as StoredSession;
    expect(stored.messages).toHaveLength(20);
    expect((await readdir(conversationsDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not resurrect a deleted session from a queued write', async () => {
    const [session] = await createMany(1);
    const pending = manager.appendMessage(session!.id, 'user', 'late');
    await expect(manager.deleteSession(session!.id)).resolves.toBe(true);
    await pending;
    expect(await readdir(conversationsDir)).toEqual([]);
  });

  it('refuses to delete a session with a running turn', async () => {
    const [session] = await createMany(1);
    manager.beginTurn(session!.id);
    await expect(manager.deleteSession(session!.id)).rejects.toThrow(/running turn/);
  });
});
