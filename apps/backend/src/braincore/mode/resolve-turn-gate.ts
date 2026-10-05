import type { WorkMode } from './work-mode.js';
import { isApproval } from './approval.js';
import type { ToolAccessPolicy } from './tool-access-policy.js';
import type { PendingApprovalStore } from './pending-approval-store.js';

export interface ResolveTurnGateInput {
  /** Read on every tool call, so switching to plan mid-turn locks the rest of that turn. */
  currentMode: () => WorkMode;
  userText: string;
  sessionId: string;
  approvals: PendingApprovalStore;
  nowMs?: number;
}

export interface ResolvedTurnGate {
  policy: ToolAccessPolicy;
  /** True when this turn unlocked mutating tools via text or Approve button. */
  approvedThisTurn: boolean;
}

/** Plan mode stays locked unless this turn carries a fresh approval. */
export function resolveTurnGate(input: ResolveTurnGateInput): ResolvedTurnGate {
  const button = input.approvals.take(input.sessionId, input.nowMs);
  const textApproved = isApproval(input.userText);
  const buttonApproved = button === true;
  const approvedThisTurn = textApproved || buttonApproved;
  const { currentMode } = input;
  return {
    policy: {
      get allowMutating() {
        return approvedThisTurn || currentMode() !== 'plan';
      },
    },
    approvedThisTurn,
  };
}
