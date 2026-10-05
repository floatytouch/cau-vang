/** HTTP contract for durable per-turn usage rollups. */

export const USAGE_DAILY_PATH = '/usage/daily';

/** UTC calendar day as `YYYY-MM-DD`. */
export const USAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface UsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Sum over priced turns only; `unpricedTurns` says how many turns it leaves out. */
  costUsd: number;
  /** Turns whose engine reported no cost, so `costUsd` is a lower bound when this is above 0. */
  unpricedTurns: number;
  durationMs: number;
}

export interface EngineUsageTotals extends UsageTotals {
  engine: string;
}

export interface DailyUsageResponse {
  day: string;
  engines: EngineUsageTotals[];
  totals: UsageTotals;
}
