import type { WorkMode } from './work-mode.js';
import { isApproval } from './approval.js';
import { createTurnToolPolicy, type ToolAccessPolicy } from './tool-access-policy.js';
import type { PendingApprovalStore } from './pending-approval-store.js';

export interface ResolveTurnGateInput {
  mode: WorkMode;
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
  const allowMutating = input.mode !== 'plan' || approvedThisTurn;
  return {
    policy: createTurnToolPolicy(allowMutating),
    approvedThisTurn,
  };
}
