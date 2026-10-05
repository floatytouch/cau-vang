import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { UsageEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeUsageDay,
  TurnUsageAccumulator,
  USAGE_LOG_FILE_NAME,
  UsageRecorder,
  utcDayOf,
} from './usage-recorder.js';

describe('UsageRecorder', () => {
  let tempDataDir: string;
  let recorder: UsageRecorder;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-8-usage-'));
    recorder = new UsageRecorder({ dataDir: tempDataDir });
  });

  afterEach(async () => {
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('aggregates multiple usage events into one durable record', async () => {
    const accumulator = new TurnUsageAccumulator({
      sessionId: 'session-1',
      turnId: 'turn-1',
      engine: 'mock',
      model: 'mock-model',
    });
    accumulator.observe(usageEvent({ inputTokens: 10, outputTokens: 4, costUsd: 0.01 }));
    accumulator.observe(
      usageEvent({ engine: 'mock', model: 'mock-model-b', inputTokens: 3, outputTokens: 2 }),
    );

    await recorder.recordTurn(accumulator.finalize(42));

    const raw = await readFile(path.join(tempDataDir, USAGE_LOG_FILE_NAME), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      sessionId: 'session-1',
      turnId: 'turn-1',
      engine: 'mock',
      model: 'mock-model-b',
      inputTokens: 13,
      outputTokens: 6,
      costUsd: 0.01,
      durationMs: 42,
    });
  });

  it('summarizes totals for one UTC day per engine', async () => {
    const day = '2026-10-05';
    await writeFile(
      path.join(tempDataDir, USAGE_LOG_FILE_NAME),
      [
        JSON.stringify({
          ts: `${day}T01:00:00.000Z`,
          sessionId: 's1',
          turnId: 't1',
          engine: 'mock',
          model: 'm1',
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0.001,
          durationMs: 100,
        }),
        JSON.stringify({
          ts: `${day}T02:00:00.000Z`,
          sessionId: 's1',
          turnId: 't2',
          engine: 'mock',
          model: 'm1',
          inputTokens: 20,
          outputTokens: 7,
          cacheReadTokens: 1,
          cacheWriteTokens: 2,
          costUsd: 0.002,
          durationMs: 200,
        }),
        JSON.stringify({
          ts: `${day}T03:00:00.000Z`,
          sessionId: 's2',
          turnId: 't3',
          engine: 'claude',
          model: 'opus',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 1.5,
          durationMs: 300,
        }),
        JSON.stringify({
          ts: '2026-10-04T23:59:59.000Z',
          sessionId: 's3',
          turnId: 't4',
          engine: 'mock',
          model: 'm1',
          inputTokens: 999,
          outputTokens: 999,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 9,
          durationMs: 9,
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const summary = await recorder.summarizeDay(day);
    expect(summary.day).toBe(day);
    expect(summary.engines).toHaveLength(2);
    expect(summary.engines[0]).toMatchObject({
      engine: 'claude',
      turns: 1,
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 300,
    });
    expect(summary.engines[0]!.costUsd).toBeCloseTo(1.5);
    expect(summary.engines[1]).toMatchObject({
      engine: 'mock',
      turns: 2,
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      durationMs: 300,
    });
    expect(summary.engines[1]!.costUsd).toBeCloseTo(0.003);
    expect(summary.totals).toMatchObject({
      turns: 3,
      inputTokens: 130,
      outputTokens: 62,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      durationMs: 600,
    });
    expect(summary.totals.costUsd).toBeCloseTo(1.503);
  });

  it('fails closed on a malformed day query', () => {
    expect(() => normalizeUsageDay('05-10-2026')).toThrow(/YYYY-MM-DD/);
    expect(normalizeUsageDay(undefined, new Date('2026-10-05T12:00:00.000Z'))).toBe('2026-10-05');
    expect(utcDayOf('2026-10-05T23:30:00.000Z')).toBe('2026-10-05');
  });

  it('skips corrupt jsonl lines instead of failing the rollup', async () => {
    await writeFile(
      path.join(tempDataDir, USAGE_LOG_FILE_NAME),
      ['not-json', '{"ts":"2026-10-05T00:00:00.000Z"}', ''].join('\n'),
      'utf8',
    );
    await expect(recorder.summarizeDay('2026-10-05')).resolves.toMatchObject({
      day: '2026-10-05',
      engines: [],
      totals: { turns: 0 },
    });
  });
});

function usageEvent(partial: Partial<UsageEvent> & Pick<UsageEvent, 'inputTokens' | 'outputTokens'>): UsageEvent {
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
