import { Logger } from '@nestjs/common';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DailyUsageResponse,
  EngineUsageTotals,
  UsageEvent,
  UsageTotals,
} from '@noot/shared';
import { USAGE_DAY_PATTERN } from '@noot/shared';
import type { UsageRecord } from './usage-types.js';

export const USAGE_LOG_FILE_NAME = 'usage.jsonl';

export interface UsageRecorderOptions {
  dataDir: string;
}

export interface TurnUsageSeed {
  sessionId: string;
  turnId: string;
  engine: string;
  model: string;
}

/** Aggregates engine `usage` events seen during one turn into a single durable record. */
export class TurnUsageAccumulator {
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private costUsd = 0;
  private model: string;
  private engine: string;

  constructor(private readonly seed: TurnUsageSeed) {
    this.engine = seed.engine;
    this.model = seed.model;
  }

  observe(event: UsageEvent): void {
    this.engine = event.engine;
    this.model = event.model;
    this.inputTokens += event.inputTokens;
    this.outputTokens += event.outputTokens;
    this.cacheReadTokens += event.cacheReadTokens ?? 0;
    this.cacheWriteTokens += event.cacheWriteTokens ?? 0;
    this.costUsd += event.costUsd ?? 0;
  }

  finalize(durationMs: number): UsageRecord {
    return {
      ts: new Date().toISOString(),
      sessionId: this.seed.sessionId,
      turnId: this.seed.turnId,
      engine: this.engine,
      model: this.model,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      costUsd: this.costUsd,
      durationMs: Math.max(0, durationMs),
    };
  }
}

export class UsageRecorder {
  private readonly logger = new Logger(UsageRecorder.name);
  private readonly logPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: UsageRecorderOptions) {
    this.logPath = path.join(options.dataDir, USAGE_LOG_FILE_NAME);
  }

  get filePath(): string {
    return this.logPath;
  }

  async recordTurn(record: UsageRecord): Promise<void> {
    const line = `${JSON.stringify(record)}\n`;
    const write = this.writeChain.then(
      () => this.appendLine(line),
      () => this.appendLine(line),
    );
    this.writeChain = write.then(
      () => undefined,
      () => undefined,
    );
    try {
      await write;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to append usage record for turn ${record.turnId}: ${reason}`);
    }
  }

  async listRecords(): Promise<UsageRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    }

    const records: UsageRecord[] = [];
    for (const line of raw.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      const parsed = parseUsageRecord(line);
      if (parsed !== undefined) {
        records.push(parsed);
      }
    }
    return records;
  }

  async summarizeDay(day: string): Promise<DailyUsageResponse> {
    const normalized = normalizeUsageDay(day);
    const records = (await this.listRecords()).filter(
      (record) => utcDayOf(record.ts) === normalized,
    );
    return buildDailyResponse(normalized, records);
  }

  private async appendLine(line: string): Promise<void> {
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, line, 'utf8');
  }
}

export function normalizeUsageDay(day: string | undefined, now = new Date()): string {
  if (day === undefined || day.trim() === '') {
    return utcDayOf(now.toISOString());
  }
  const trimmed = day.trim();
  if (!USAGE_DAY_PATTERN.test(trimmed)) {
    throw new Error(`day must be YYYY-MM-DD UTC, got ${JSON.stringify(day)}`);
  }
  return trimmed;
}

export function utcDayOf(isoTimestamp: string): string {
  const millis = Date.parse(isoTimestamp);
  if (Number.isNaN(millis)) {
    throw new Error(`usage record ts is not a valid ISO timestamp: ${JSON.stringify(isoTimestamp)}`);
  }
  return new Date(millis).toISOString().slice(0, 10);
}

function buildDailyResponse(day: string, records: UsageRecord[]): DailyUsageResponse {
  const byEngine = new Map<string, EngineUsageTotals>();
  for (const record of records) {
    const current = byEngine.get(record.engine) ?? emptyEngineTotals(record.engine);
    current.turns += 1;
    current.inputTokens += record.inputTokens;
    current.outputTokens += record.outputTokens;
    current.cacheReadTokens += record.cacheReadTokens;
    current.cacheWriteTokens += record.cacheWriteTokens;
    current.costUsd += record.costUsd;
    current.durationMs += record.durationMs;
    byEngine.set(record.engine, current);
  }

  const engines = [...byEngine.values()].sort((left, right) =>
    left.engine.localeCompare(right.engine),
  );
  return { day, engines, totals: sumTotals(engines) };
}

function emptyEngineTotals(engine: string): EngineUsageTotals {
  return {
    engine,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    durationMs: 0,
  };
}

function sumTotals(engines: EngineUsageTotals[]): UsageTotals {
  return engines.reduce<UsageTotals>(
    (totals, engine) => ({
      turns: totals.turns + engine.turns,
      inputTokens: totals.inputTokens + engine.inputTokens,
      outputTokens: totals.outputTokens + engine.outputTokens,
      cacheReadTokens: totals.cacheReadTokens + engine.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens + engine.cacheWriteTokens,
      costUsd: totals.costUsd + engine.costUsd,
      durationMs: totals.durationMs + engine.durationMs,
    }),
    {
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      durationMs: 0,
    },
  );
}

function parseUsageRecord(line: string): UsageRecord | undefined {
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
    typeof record.ts !== 'string' ||
    typeof record.sessionId !== 'string' ||
    typeof record.turnId !== 'string' ||
    typeof record.engine !== 'string' ||
    typeof record.model !== 'string' ||
    !isNonNegativeNumber(record.inputTokens) ||
    !isNonNegativeNumber(record.outputTokens) ||
    !isNonNegativeNumber(record.cacheReadTokens) ||
    !isNonNegativeNumber(record.cacheWriteTokens) ||
    !isNonNegativeNumber(record.costUsd) ||
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
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    costUsd: record.costUsd,
    durationMs: record.durationMs,
  };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}
