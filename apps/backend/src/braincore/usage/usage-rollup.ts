import type { DailyUsageResponse, EngineUsageTotals, UsageTotals } from '@noot/shared';
import type { UsageRecord } from './usage-types.js';

/** Returns `undefined` for any line that is not a complete, well-typed usage record. */
export function parseUsageRecord(line: string): UsageRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    !isTimestamp(record.ts) ||
    typeof record.sessionId !== 'string' ||
    typeof record.turnId !== 'string' ||
    typeof record.engine !== 'string' ||
    typeof record.model !== 'string' ||
    !isStringArray(record.reportedModels) ||
    !isNonNegativeNumber(record.inputTokens) ||
    !isNonNegativeNumber(record.outputTokens) ||
    !isNonNegativeNumber(record.cacheReadTokens) ||
    !isNonNegativeNumber(record.cacheWriteTokens) ||
    !(record.costUsd === null || isNonNegativeNumber(record.costUsd)) ||
    !isNonNegativeNumber(record.durationMs)
  ) {
    return undefined;
  }
  return {
    ts: record.ts,
    sessionId: record.sessionId,
    turnId: record.turnId,
    engine: record.engine,
    model: record.model,
    reportedModels: record.reportedModels,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    costUsd: record.costUsd,
    durationMs: record.durationMs,
  };
}

export function buildDailyResponse(day: string, records: UsageRecord[]): DailyUsageResponse {
  const byEngine = new Map<string, EngineUsageTotals>();
  for (const record of records) {
    const current = byEngine.get(record.engine) ?? { engine: record.engine, ...emptyTotals() };
    addRecord(current, record);
    byEngine.set(record.engine, current);
  }

  const engines = [...byEngine.values()].sort((left, right) =>
    left.engine.localeCompare(right.engine),
  );
  const totals = emptyTotals();
  for (const record of records) {
    addRecord(totals, record);
  }
  return { day, engines, totals };
}

function addRecord(totals: UsageTotals, record: UsageRecord): void {
  totals.turns += 1;
  totals.inputTokens += record.inputTokens;
  totals.outputTokens += record.outputTokens;
  totals.cacheReadTokens += record.cacheReadTokens;
  totals.cacheWriteTokens += record.cacheWriteTokens;
  totals.durationMs += record.durationMs;
  if (record.costUsd === null) {
    totals.unpricedTurns += 1;
  } else {
    totals.costUsd += record.costUsd;
  }
}

function emptyTotals(): UsageTotals {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    unpricedTurns: 0,
    durationMs: 0,
  };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
