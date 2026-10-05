/** One durable audit line written after a conversation turn finishes. */
export interface UsageRecord {
  ts: string;
  sessionId: string;
  turnId: string;
  engine: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
}
