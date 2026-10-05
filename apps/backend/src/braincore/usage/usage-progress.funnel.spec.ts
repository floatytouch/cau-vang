import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isNootEvent, type NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../config/app-config.js';
import { BraincoreService, BRAINCORE_EVENT_CHANNEL } from '../braincore.service.js';
import {
  MOCK_ENGINE_ID,
  MOCK_USAGE_COST_USD,
  MOCK_USAGE_INPUT_TOKENS,
  MOCK_USAGE_OUTPUT_TOKENS,
} from '../testing/mock-engine-adapter.js';
import { PROGRESS_STAGE } from './progress-stages.js';

async function startService(dataDir: string): Promise<BraincoreService> {
  const service = new BraincoreService({
    dataDir,
    identityConfigDir: DEFAULT_IDENTITY_CONFIG_DIR,
    registerMocks: true,
  });
  await service.initialize();
  return service;
}

describe('NV-8 usage + progress funnel', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-8-funnel-'));
    service = await startService(tempDataDir);
  });

  afterEach(async () => {
    service.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('writes exactly one usage record per mock turn and streams progress stages', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const collected: NootEvent[] = [];
    service.on(BRAINCORE_EVENT_CHANNEL, (event: NootEvent) => collected.push(event));

    const turnId = await service.sendUserMessage(session.id, 'track me');

    expect(collected.every(isNootEvent)).toBe(true);
    expect(collected.map((event) => event.seq)).toEqual(collected.map((_, index) => index));
    expect(collected.map((event) => event.type)).toEqual([
      'progress',
      'text_delta',
      'usage',
      'progress',
      'done',
    ]);
    expect(collected[0]).toMatchObject({
      type: 'progress',
      label: PROGRESS_STAGE.STARTING,
      fraction: 0,
      turnId,
    });
    expect(collected[2]).toMatchObject({
      type: 'usage',
      engine: MOCK_ENGINE_ID,
      model: 'mock-model',
      inputTokens: MOCK_USAGE_INPUT_TOKENS,
      outputTokens: MOCK_USAGE_OUTPUT_TOKENS,
      costUsd: MOCK_USAGE_COST_USD,
    });
    expect(collected[3]).toMatchObject({
      type: 'progress',
      label: PROGRESS_STAGE.FINISHING,
      fraction: 1,
    });

    const records = await service.usage.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sessionId: session.id,
      turnId,
      engine: MOCK_ENGINE_ID,
      model: 'mock-model',
      inputTokens: MOCK_USAGE_INPUT_TOKENS,
      outputTokens: MOCK_USAGE_OUTPUT_TOKENS,
      costUsd: MOCK_USAGE_COST_USD,
    });
    expect(records[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });
});
