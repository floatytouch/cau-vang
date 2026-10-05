/** One durable audit line written after a conversation turn finishes. */
export interface UsageRecord {
  ts: string;
  sessionId: string;
  turnId: string;
  engine: string;
  /** The model the session asked for; `reportedModels` lists what the engine actually billed. */
  model: string;
  reportedModels: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `null` when any usage event of the turn (or the turn itself) carried no cost. */
  costUsd: number | null;
  durationMs: number;
}
