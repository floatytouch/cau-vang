/** An Approve tap older than this is dropped rather than unlocking an unrelated turn. */
export const APP_APPROVAL_TTL_MS = 120_000;

interface PendingApproval {
  approved: boolean;
  recordedAtMs: number;
}

/** One-shot UI Approve/Reject, consumed by the next user turn; text approvals bypass it. */
export class PendingApprovalStore {
  private readonly pending = new Map<string, PendingApproval>();

  queue(sessionId: string, approved: boolean, nowMs = Date.now()): void {
    this.pending.set(sessionId, { approved, recordedAtMs: nowMs });
  }

  /** Returns the pending answer, or undefined when none / expired. Always clears. */
  take(sessionId: string, nowMs = Date.now()): boolean | undefined {
    const entry = this.pending.get(sessionId);
    this.pending.delete(sessionId);
    if (!entry) {
      return undefined;
    }
    if (nowMs - entry.recordedAtMs > APP_APPROVAL_TTL_MS) {
      return undefined;
    }
    return entry.approved;
  }

  clear(sessionId: string): void {
    this.pending.delete(sessionId);
  }
}
