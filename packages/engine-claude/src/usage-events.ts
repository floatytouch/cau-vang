import {
  NOOT_EVENT_TYPE_USAGE,
} from '@noot/shared';
import type { ModelUsage } from '@anthropic-ai/claude-agent-sdk';
import type { UsageEvent } from '@noot/shared';

import { CLAUDE_ENGINE_ID } from './constants.js';
import type { EventSequence } from './event-sequence.js';

/** One `usage` event per model the turn used, so no tokens are dropped or misattributed. */
export function usageEventsFromModelUsage(
  sequence: EventSequence,
  modelUsage: Record<string, ModelUsage> | undefined,
): UsageEvent[] {
  return Object.entries(modelUsage ?? {}).map(([model, usage]) => ({
    ...sequence.meta(),
    type: NOOT_EVENT_TYPE_USAGE,
    engine: CLAUDE_ENGINE_ID,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadInputTokens,
    cacheWriteTokens: usage.cacheCreationInputTokens,
    costUsd: usage.costUSD,
  }));
}
