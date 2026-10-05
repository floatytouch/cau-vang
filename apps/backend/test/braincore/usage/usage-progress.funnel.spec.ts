import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isNootEvent, WS_NOOT_EVENT, type EngineAdapter, type NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../../src/config/app-config.js';
import { BraincoreService } from '../../../src/braincore/braincore.service.js';
import {
  MOCK_ENGINE_ID,
  MOCK_USAGE_COST_USD,
  MOCK_USAGE_INPUT_TOKENS,
  MOCK_USAGE_OUTPUT_TOKENS,
} from '../../../src/braincore/testing/mock-engine-adapter.js';

async function startService(dataDir: string): Promise<BraincoreService> {
  const service = new BraincoreService({
    dataDir,
    identityConfigDir: DEFAULT_IDENTITY_CONFIG_DIR,
    registerMocks: true,
  });
  await service.initialize();
  return service;
}

describe('usage + progress funnel', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-usage-funnel-'));
    service = await startService(tempDataDir);
  });

  afterEach(async () => {
    service.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('writes exactly one usage record per mock turn and streams progress stages', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const collected: NootEvent[] = [];
    service.on(WS_NOOT_EVENT, (event: NootEvent) => collected.push(event));

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
      label: 'starting',
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
      label: 'finishing',
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

  it('records a failed turn once, with no tokens and unknown cost', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    replaceStartTurn(service, () => {
      throw new Error('engine exploded');
    });

    const turnId = await service.sendUserMessage(session.id, 'boom');

    const records = await service.usage.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ turnId, inputTokens: 0, costUsd: null, reportedModels: [] });
  });

  it('records a cancelled turn once, keeping the usage it reported', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    replaceStartTurn(service, async function* (engineSession, _input, options) {
      const meta = {
        sessionId: engineSession.sessionId,
        turnId: options.turnId,
        emittedAt: new Date().toISOString(),
      };
      yield {
        ...meta,
        seq: 0,
        type: 'usage',
        engine: MOCK_ENGINE_ID,
        model: options.model,
        inputTokens: 4,
        outputTokens: 0,
      };
      yield { ...meta, seq: 1, type: 'done', reason: 'cancelled' };
    });

    const turnId = await service.sendUserMessage(session.id, 'stop');

    const records = await service.usage.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ turnId, inputTokens: 4, costUsd: null });
  });

  it('records nothing for an internal note turn', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.postInternalTurn(session.id, 'cron', 'background result');
    await expect(service.usage.listRecords()).resolves.toEqual([]);
  });

  it('records one line per turn when sessions run turns concurrently', async () => {
    const sessions = await Promise.all(
      Array.from({ length: 5 }, () => service.createSession(MOCK_ENGINE_ID, 'mock-model')),
    );
    const turnIds = await Promise.all(
      sessions.map((session) => service.sendUserMessage(session.id, 'parallel')),
    );

    const records = await service.usage.listRecords();
    expect(records.map((record) => record.turnId).sort()).toEqual([...turnIds].sort());
  });
});

function replaceStartTurn(service: BraincoreService, startTurn: EngineAdapter['startTurn']): void {
  const engine = service.engines.get(MOCK_ENGINE_ID) as { startTurn: EngineAdapter['startTurn'] };
  engine.startTurn = startTurn;
}
