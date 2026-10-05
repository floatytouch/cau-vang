import { describe, expect, it } from 'vitest';
import { ToolRegistry, registerSampleTools } from '../tools/tool-registry.js';
import { APP_APPROVAL_TTL_MS, PendingApprovalStore } from './pending-approval-store.js';
import { resolveTurnGate } from './resolve-turn-gate.js';
import { decideMutatingToolAccess, createTurnToolPolicy } from './tool-access-policy.js';
import { normalizeWorkMode, SAFE_WORK_MODE, type WorkMode } from './work-mode.js';

const WRITE_CALL = { callId: 'c1', name: 'write_scratch', args: { note: 'x' } };

function planGate(userText: string, approvals = new PendingApprovalStore(), nowMs?: number) {
  return resolveTurnGate({
    currentMode: () => 'plan',
    userText,
    sessionId: 'session-1',
    approvals,
    nowMs,
  });
}

describe('mode gate primitives', () => {
  it('fails closed to plan when persisted mode is corrupt', () => {
    expect(normalizeWorkMode(undefined)).toBe('auto');
    expect(normalizeWorkMode('auto')).toBe('auto');
    expect(normalizeWorkMode('plan')).toBe('plan');
    expect(normalizeWorkMode('weird')).toBe(SAFE_WORK_MODE);
    expect(normalizeWorkMode(null)).toBe(SAFE_WORK_MODE);
    expect(normalizeWorkMode('')).toBe(SAFE_WORK_MODE);
  });

  it('blocks mutating tools unless the turn policy allows them', () => {
    expect(decideMutatingToolAccess(createTurnToolPolicy(true), 'write_scratch')).toEqual({
      ok: true,
    });
    const denied = decideMutatingToolAccess(createTurnToolPolicy(false), 'write_scratch');
    expect(denied.ok).toBe(false);
  });

  it('consumes Approve for exactly one resolve, then locks again', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-1', true, 1_000);
    const first = planGate('please proceed with the plan', approvals, 1_500);
    expect(first.policy.allowMutating).toBe(true);
    expect(first.approvedThisTurn).toBe(true);

    const second = planGate('and keep going', approvals, 2_000);
    expect(second.policy.allowMutating).toBe(false);
    expect(second.approvedThisTurn).toBe(false);
  });

  it('a Reject tap does not unlock the turn', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-1', false, 1_000);
    expect(planGate('do the thing', approvals, 1_500).policy.allowMutating).toBe(false);
  });

  it('keeps one session approval out of another session', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-other', true, 1_000);
    expect(planGate('do the thing', approvals, 1_500).policy.allowMutating).toBe(false);
  });

  it('ignores Approve taps older than the TTL', () => {
    const approvals = new PendingApprovalStore();
    approvals.queue('session-1', true, 1_000);
    const gate = planGate('still waiting', approvals, 1_000 + APP_APPROVAL_TTL_MS + 1);
    expect(gate.policy.allowMutating).toBe(false);
  });

  it('unlocks a plan turn from a short text approval without a button tap', () => {
    const gate = planGate('ok');
    expect(gate.approvedThisTurn).toBe(true);
    expect(gate.policy.allowMutating).toBe(true);
  });

  it('locks the rest of an auto turn the moment the session switches to plan', async () => {
    let mode: WorkMode = 'auto';
    const gate = resolveTurnGate({
      currentMode: () => mode,
      userText: 'rewrite the scratch note',
      sessionId: 'session-1',
      approvals: new PendingApprovalStore(),
    });
    const registry = new ToolRegistry();
    registerSampleTools(registry);
    expect(await registry.execute(WRITE_CALL, gate.policy)).toMatchObject({ ok: true });
    mode = 'plan';
    expect(await registry.execute(WRITE_CALL, gate.policy)).toMatchObject({
      ok: false,
      blocked: true,
    });
  });
});

describe('harness tool bridge (belt and braces)', () => {
  it('omits mutating tools from plan-mode definitions and refuses them on execute', async () => {
    const registry = new ToolRegistry();
    registerSampleTools(registry);
    const locked = registry.createBridge(createTurnToolPolicy(false));
    expect(locked.definitions.map((definition) => definition.name)).not.toContain('write_scratch');
    expect(locked.definitions.map((definition) => definition.name)).toContain('echo_message');
    expect(await locked.execute(WRITE_CALL)).toMatchObject({ ok: false, blocked: true });

    const open = registry.createBridge(createTurnToolPolicy(true));
    expect(open.definitions.map((definition) => definition.name)).toContain('write_scratch');
    expect(await open.execute(WRITE_CALL)).toEqual({ ok: true, result: { written: 'x' } });
  });

  it('treats a tool registered without a mutating flag as mutating', async () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'unflagged', description: '', inputSchema: {} }, async () => ({
      ok: true,
      result: null,
    }));
    const locked = createTurnToolPolicy(false);
    expect(registry.definitions(locked)).toEqual([]);
    expect(
      await registry.execute({ callId: 'c1', name: 'unflagged', args: {} }, locked),
    ).toMatchObject({ ok: false, blocked: true });
  });
});
