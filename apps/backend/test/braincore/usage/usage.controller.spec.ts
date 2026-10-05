import 'reflect-metadata';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { USAGE_DAILY_PATH, type DailyUsageResponse } from '@noot/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../../src/config/app-config.js';
import {
  BRAINCORE_OPTIONS,
  BraincoreService,
  type BraincoreServiceOptions,
} from '../../../src/braincore/braincore.service.js';
import {
  MOCK_ENGINE_ID,
  MOCK_USAGE_COST_USD,
  MOCK_USAGE_INPUT_TOKENS,
  MOCK_USAGE_OUTPUT_TOKENS,
} from '../../../src/braincore/testing/mock-engine-adapter.js';
import { UsageController } from '../../../src/braincore/usage/usage.controller.js';
import { utcDayOf } from '../../../src/braincore/usage/usage-day.js';
import { USAGE_LOG_FILE_NAME } from '../../../src/braincore/usage/usage-recorder.js';

describe('GET /usage/daily', () => {
  let app: INestApplication;
  let tempDataDir: string;
  let braincore: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-usage-http-'));
    const options: BraincoreServiceOptions = {
      dataDir: tempDataDir,
      identityConfigDir: DEFAULT_IDENTITY_CONFIG_DIR,
      registerMocks: true,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UsageController],
      providers: [{ provide: BRAINCORE_OPTIONS, useValue: options }, BraincoreService],
    }).compile();
    braincore = moduleRef.get(BraincoreService);
    await braincore.initialize();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    braincore?.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('returns daily totals that match the durable usage records from mock turns', async () => {
    const session = await braincore.createSession(MOCK_ENGINE_ID, 'mock-model');
    await braincore.sendUserMessage(session.id, 'hello usage');
    await braincore.sendUserMessage(session.id, 'second turn');

    const records = await braincore.usage.listRecords();
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.turnId)).size).toBe(2);

    const day = utcDayOf(records[0]!.ts);
    const response = await request(app.getHttpServer())
      .get(USAGE_DAILY_PATH)
      .query({ day })
      .expect(200);
    const body = response.body as DailyUsageResponse;

    expect(body.day).toBe(day);
    expect(body.engines).toHaveLength(1);
    expect(body.engines[0]).toMatchObject({
      engine: MOCK_ENGINE_ID,
      turns: 2,
      inputTokens: MOCK_USAGE_INPUT_TOKENS * 2,
      outputTokens: MOCK_USAGE_OUTPUT_TOKENS * 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(body.engines[0]!.costUsd).toBeCloseTo(MOCK_USAGE_COST_USD * 2);
    expect(body.engines[0]!.unpricedTurns).toBe(0);
    expect(body.engines[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(body.totals.turns).toBe(2);
    expect(body.totals.inputTokens).toBe(MOCK_USAGE_INPUT_TOKENS * 2);
    expect(body.totals.outputTokens).toBe(MOCK_USAGE_OUTPUT_TOKENS * 2);
    expect(body.totals.costUsd).toBeCloseTo(MOCK_USAGE_COST_USD * 2);
    expect(body.totals.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a malformed day query', async () => {
    const response = await request(app.getHttpServer())
      .get(USAGE_DAILY_PATH)
      .query({ day: '10/05/2026' })
      .expect(400);
    expect(JSON.stringify(response.body)).toMatch(/YYYY-MM-DD/);
  });

  it('defaults to today when no day is given', async () => {
    const response = await request(app.getHttpServer()).get(USAGE_DAILY_PATH).expect(200);
    expect((response.body as DailyUsageResponse).day).toBe(utcDayOf(new Date().toISOString()));
  });

  it('reports a storage failure as a server error without leaking the data path', async () => {
    await mkdir(path.join(tempDataDir, USAGE_LOG_FILE_NAME));
    const response = await request(app.getHttpServer())
      .get(USAGE_DAILY_PATH)
      .query({ day: '2026-10-05' })
      .expect(500);
    expect(JSON.stringify(response.body)).not.toContain(tempDataDir);
  });
});
