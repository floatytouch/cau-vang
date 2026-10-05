import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { UsageEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeUsageDay, utcDayOf } from '../../../src/braincore/usage/usage-day.js';
import {
  TurnUsageAccumulator,
  USAGE_LOG_FILE_NAME,
  UsageRecorder,
} from '../../../src/braincore/usage/usage-recorder.js';
import type { UsageRecord } from '../../../src/braincore/usage/usage-types.js';

const DAY = '2026-10-05';

describe('TurnUsageAccumulator', () => {
  it('sums every usage event into one record and keeps the requested model', () => {
    const accumulator = newAccumulator();
    accumulator.observe(
      usageEvent({ model: 'model-a', inputTokens: 10, outputTokens: 4, costUsd: 0.01 }),
    );
    accumulator.observe(
      usageEvent({ model: 'model-b', inputTokens: 3, outputTokens: 2, costUsd: 0.02 }),
    );

    const record = accumulator.finalize(42);

    expect(record).toMatchObject({
      sessionId: 'session-1',
      turnId: 'turn-1',
      engine: 'mock',
      model: 'requested-model',
      reportedModels: ['model-a', 'model-b'],
      inputTokens: 13,
      outputTokens: 6,
      durationMs: 42,
    });
    expect(record.costUsd).toBeCloseTo(0.03);
  });

  it('marks cost unknown when an event carries no cost', () => {
    const accumulator = newAccumulator();
    accumulator.observe(usageEvent({ inputTokens: 1, outputTokens: 1, costUsd: 0.5 }));
    accumulator.observe(usageEvent({ inputTokens: 1, outputTokens: 1 }));
    expect(accumulator.finalize(0).costUsd).toBeNull();
  });

  it('marks cost unknown when the turn reported no usage at all', () => {
    expect(newAccumulator().finalize(0)).toMatchObject({ costUsd: null, reportedModels: [] });
  });

  it('keeps a reported zero cost as free, not unknown', () => {
    const accumulator = newAccumulator();
    accumulator.observe(usageEvent({ inputTokens: 1, outputTokens: 1, costUsd: 0 }));
    expect(accumulator.finalize(0).costUsd).toBe(0);
  });
});

describe('UsageRecorder', () => {
  let tempDataDir: string;
  let recorder: UsageRecorder;
  let logPath: string;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-8-usage-'));
    recorder = new UsageRecorder({ dataDir: tempDataDir });
    logPath = path.join(tempDataDir, USAGE_LOG_FILE_NAME);
  });

  afterEach(async () => {
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('appends one jsonl line per recorded turn', async () => {
    await recorder.recordTurn(newAccumulator().finalize(1));
    await recorder.recordTurn(newAccumulator().finalize(2));
    const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('keeps every line whole when many turns record concurrently', async () => {
    const turns = Array.from({ length: 50 }, (_, index) =>
      recorder.recordTurn(record({ turnId: `t${index}` })),
    );
    await Promise.all(turns);
    const records = await recorder.listRecords();
    expect(new Set(records.map((entry) => entry.turnId)).size).toBe(50);
  });

  it('swallows a failed append so the turn still finishes', async () => {
    await mkdir(logPath);
    await expect(recorder.recordTurn(record())).resolves.toBeUndefined();
  });

  it('summarizes totals for one UTC day per engine and overall', async () => {
    await writeLog([
      record({
        ts: `${DAY}T00:00:00.000Z`,
        engine: 'mock',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.001,
        durationMs: 100,
      }),
      record({
        ts: `${DAY}T02:00:00.000Z`,
        engine: 'mock',
        inputTokens: 20,
        outputTokens: 7,
        cacheReadTokens: 1,
        cacheWriteTokens: 2,
        costUsd: null,
        durationMs: 200,
      }),
      record({
        ts: `${DAY}T23:59:59.999Z`,
        engine: 'claude',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 1.5,
        durationMs: 300,
      }),
      record({ ts: '2026-10-04T23:59:59.999Z', engine: 'mock', inputTokens: 999, costUsd: 9 }),
      record({ ts: '2026-10-06T00:00:00.000Z', engine: 'mock', inputTokens: 999, costUsd: 9 }),
    ]);

    const summary = await recorder.summarizeDay(DAY);

    expect(summary.day).toBe(DAY);
    expect(summary.engines.map((engine) => engine.engine)).toEqual(['claude', 'mock']);
    expect(summary.engines[0]).toMatchObject({
      turns: 1,
      inputTokens: 100,
      outputTokens: 50,
      unpricedTurns: 0,
      durationMs: 300,
    });
    expect(summary.engines[0]!.costUsd).toBeCloseTo(1.5);
    expect(summary.engines[1]).toMatchObject({
      turns: 2,
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      unpricedTurns: 1,
      durationMs: 300,
    });
    expect(summary.engines[1]!.costUsd).toBeCloseTo(0.001);
    expect(summary.totals).toMatchObject({
      turns: 3,
      inputTokens: 130,
      outputTokens: 62,
      unpricedTurns: 1,
      durationMs: 600,
    });
    expect(summary.totals.costUsd).toBeCloseTo(1.501);
  });

  it('returns empty totals when no usage has been recorded yet', async () => {
    await expect(recorder.summarizeDay(DAY)).resolves.toMatchObject({
      engines: [],
      totals: { turns: 0, costUsd: 0, unpricedTurns: 0 },
    });
  });

  it('skips corrupt lines, including a well-formed line with an unparseable ts', async () => {
    await writeFile(
      logPath,
      [
        'not-json',
        '{"ts":"2026-10-05T00:00:00.000Z"}',
        JSON.stringify(record({ ts: 'not-a-date' })),
        JSON.stringify(record({ ts: `${DAY}T05:00:00.000Z`, inputTokens: 7 })),
        '{"truncated":',
      ].join('\n'),
      'utf8',
    );
    await expect(recorder.summarizeDay(DAY)).resolves.toMatchObject({
      totals: { turns: 1, inputTokens: 7 },
    });
  });

  async function writeLog(records: UsageRecord[]): Promise<void> {
    await writeFile(logPath, records.map((entry) => `${JSON.stringify(entry)}\n`).join(''), 'utf8');
  }
});

describe('usage day parsing', () => {
  it('defaults to today in UTC and accepts a real calendar day', () => {
    expect(normalizeUsageDay(undefined, new Date('2026-10-05T23:30:00.000-05:00'))).toBe(
      '2026-10-06',
    );
    expect(normalizeUsageDay(' 2024-02-29 ')).toBe('2024-02-29');
    expect(utcDayOf('2026-10-05T23:30:00.000Z')).toBe(DAY);
  });

  it.each([
    '05-10-2026',
    '2026-13-01',
    '2026-02-30',
    '2025-02-29',
    '2026-10-05T00:00:00Z',
    '../../etc',
  ])('fails closed on %j', (day) => {
    expect(() => normalizeUsageDay(day)).toThrow(/YYYY-MM-DD/);
  });
});

function newAccumulator(): TurnUsageAccumulator {
  return new TurnUsageAccumulator({
    sessionId: 'session-1',
    turnId: 'turn-1',
    engine: 'mock',
    model: 'requested-model',
  });
}

function record(partial: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: `${DAY}T12:00:00.000Z`,
    sessionId: 's1',
    turnId: 't1',
    engine: 'mock',
    model: 'm1',
    reportedModels: ['m1'],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    durationMs: 0,
    ...partial,
  };
}

function usageEvent(
  partial: Partial<UsageEvent> & Pick<UsageEvent, 'inputTokens' | 'outputTokens'>,
): UsageEvent {
  return {
    sessionId: 'session',
    turnId: 'turn',
    seq: 0,
    emittedAt: new Date().toISOString(),
    type: 'usage',
    engine: 'mock',
    model: 'mock-model',
    ...partial,
  };
}
