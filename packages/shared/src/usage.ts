/** HTTP contract for durable per-turn usage rollups. */

export const USAGE_DAILY_PATH = '/usage/daily';

/** UTC calendar day as `YYYY-MM-DD`. */
export const USAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface EngineUsageTotals {
  engine: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface UsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface DailyUsageResponse {
  day: string;
  engines: EngineUsageTotals[];
  totals: UsageTotals;
}
