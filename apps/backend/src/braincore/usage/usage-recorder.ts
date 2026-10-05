import { Logger } from '@nestjs/common';
import { appendFile, mkdir, open, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { DailyUsageResponse, UsageEvent } from '@noot/shared';
import { normalizeUsageDay, utcDayOf } from './usage-day.js';
import { buildDailyResponse, parseUsageRecord } from './usage-rollup.js';
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
  private everyEventPriced = true;
  private readonly reportedModels = new Set<string>();

  constructor(private readonly seed: TurnUsageSeed) {}

  observe(event: UsageEvent): void {
    this.reportedModels.add(event.model);
    this.inputTokens += event.inputTokens;
    this.outputTokens += event.outputTokens;
    this.cacheReadTokens += event.cacheReadTokens ?? 0;
    this.cacheWriteTokens += event.cacheWriteTokens ?? 0;
    if (event.costUsd === undefined) {
      this.everyEventPriced = false;
    } else {
      this.costUsd += event.costUsd;
    }
  }

  finalize(durationMs: number): UsageRecord {
    const priced = this.everyEventPriced && this.reportedModels.size > 0;
    return {
      ts: new Date().toISOString(),
      sessionId: this.seed.sessionId,
      turnId: this.seed.turnId,
      engine: this.seed.engine,
      model: this.seed.model,
      reportedModels: [...this.reportedModels],
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      costUsd: priced ? this.costUsd : null,
      durationMs: Math.max(0, durationMs),
    };
  }
}

/** Append-only `usage.jsonl` under the BrainCore data dir; a failed write never fails the turn. */
export class UsageRecorder {
  private readonly logger = new Logger(UsageRecorder.name);
  private readonly logPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: UsageRecorderOptions) {
    this.logPath = path.join(options.dataDir, USAGE_LOG_FILE_NAME);
  }

  async recordTurn(record: UsageRecord): Promise<void> {
    const line = `${JSON.stringify(record)}\n`;
    const write = this.writeChain.then(() => this.appendLine(line));
    this.writeChain = write.catch(() => undefined);
    try {
      await write;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to append usage record for turn ${record.turnId}: ${reason}`);
    }
  }

  async listRecords(): Promise<UsageRecord[]> {
    return this.collectRecords(() => true);
  }

  async summarizeDay(day: string): Promise<DailyUsageResponse> {
    const normalized = normalizeUsageDay(day);
    const records = await this.collectRecords((record) => utcDayOf(record.ts) === normalized);
    return buildDailyResponse(normalized, records);
  }

  private async collectRecords(keep: (record: UsageRecord) => boolean): Promise<UsageRecord[]> {
    let file: FileHandle;
    try {
      file = await open(this.logPath, 'r');
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    }
    const records: UsageRecord[] = [];
    try {
      for await (const line of file.readLines({ encoding: 'utf8' })) {
        const record = line.trim() === '' ? undefined : parseUsageRecord(line);
        if (record !== undefined && keep(record)) {
          records.push(record);
        }
      }
    } finally {
      await file.close();
    }
    return records;
  }

  private async appendLine(line: string): Promise<void> {
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, line, 'utf8');
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}
