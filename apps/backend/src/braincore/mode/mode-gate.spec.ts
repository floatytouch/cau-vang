import { describe, expect, it } from 'vitest';
import { APP_APPROVAL_TTL_MS, PendingApprovalStore } from './pending-approval-store.js';
import { resolveTurnGate } from './resolve-turn-gate.js';
import { decideMutatingToolAccess, createTurnToolPolicy } from './tool-access-policy.js';
import { normalizeWorkMode, SAFE_WORK_MODE } from './work-mode.js';

describe('mode gate primitives', () => {
  it('fails closed to plan when persisted mode is corrupt', () => {
    expect(normalizeWorkMode(undefined)).toBe('auto');
    expect(normalizeWorkMode('auto')).toBe('auto');
    expect(normalizeWorkMode('plan')).toBe('plan');
    expect(normalizeWorkMode('weird')).toBe(SAFE_WORK_MODE);
  });

  it('blocks mutating tools unless the turn policy allows them', () => {
    expect(decideMutatingToolAccess(undefined, 'write_scratch')).toEqual({ ok: true });
    expect(decideMutatingToolAccess(createTurnToolPolicy(true), 'write_scratch')).toEqual({
      ok: true,
    });
    const denied = decideMutatingToolAccess(createTurnToolPolicy(false), 'write_scratch');
    expect(denied.ok).toBe(false);
  });

  it('consumes Approve for exactly one resolve, then locks again', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-1', true, 1_000);
    const first = resolveTurnGate({
      mode: 'plan',
      userText: 'please proceed with the plan',
      sessionId: 'session-1',
      approvals,
      nowMs: 1_500,
    });
    expect(first.policy.allowMutating).toBe(true);
    expect(first.approvedThisTurn).toBe(true);

    const second = resolveTurnGate({
      mode: 'plan',
      userText: 'and keep going',
      sessionId: 'session-1',
      approvals,
      nowMs: 2_000,
    });
    expect(second.policy.allowMutating).toBe(false);
    expect(second.approvedThisTurn).toBe(false);
  });

  it('ignores Approve taps older than the TTL', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-1', true, 1_000);
    const gate = resolveTurnGate({
      mode: 'plan',
      userText: 'still waiting',
      sessionId: 'session-1',
      approvals,
      nowMs: 1_000 + APP_APPROVAL_TTL_MS + 1,
    });
    expect(gate.policy.allowMutating).toBe(false);
  });

  it('unlocks a plan turn from a short text approval without a button tap', () => {
    const approvals = new PendingApprovalStore();
    const gate = resolveTurnGate({
      mode: 'plan',
      userText: 'ok',
      sessionId: 'session-1',
      approvals,
    });
    expect(gate.approvedThisTurn).toBe(true);
    expect(gate.policy.allowMutating).toBe(true);
  });
});
