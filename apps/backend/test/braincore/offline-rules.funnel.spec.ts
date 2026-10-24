import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OFFLINE_RULES_SHOW_CHOICES_MARKER } from '@noot/engine-offline';
import { OFFLINE_RULES_ENGINE_ID, WS_NOOT_EVENT, type NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../src/config/app-config.js';
import { BraincoreService } from '../../src/braincore/braincore.service.js';
import { useOutboundHttpGuard } from '../support/block-outbound-http.js';

useOutboundHttpGuard();

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
  service.on(WS_NOOT_EVENT, (event: NootEvent) => collected.push(event));
  return collected;
}

describe('offline-rules engine funnel', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-offline-rules-'));
    service = await startService(tempDataDir);
  });

  afterEach(async () => {
    service.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('registers offline-rules with mock engines and completes a turn without HTTP', async () => {
    expect(service.engines.listIds().sort()).toContain(OFFLINE_RULES_ENGINE_ID);
    expect(service.listEngines().map((engine) => engine.id)).toContain(OFFLINE_RULES_ENGINE_ID);

    const session = await service.createSession(OFFLINE_RULES_ENGINE_ID, 'rules');
    const collected = collectEvents(service);
    await service.sendUserMessage(session.id, `demo ${OFFLINE_RULES_SHOW_CHOICES_MARKER}`);

    expect(collected.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
    expect(collected.some((event) => event.type === 'choices')).toBe(true);
    expect(collected.some((event) => event.type === 'text_delta' && event.text.startsWith('echo:'))).toBe(
      true,
    );
  });
});
