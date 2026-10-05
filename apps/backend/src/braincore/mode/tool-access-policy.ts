/**
 * Per-turn policy handed into ToolRegistry so concurrent sessions stay independent.
 * Required on every registry call: a missing policy must not silently mean "allow".
 */
export interface ToolAccessPolicy {
  /** When false, mutating tools are omitted from harness bridges and refused on execute. */
  readonly allowMutating: boolean;
}

export function createTurnToolPolicy(allowMutating: boolean): ToolAccessPolicy {
  return { allowMutating };
}

export function decideMutatingToolAccess(
  policy: ToolAccessPolicy,
  toolName: string,
): { ok: true } | { ok: false; reason: string } {
  if (policy.allowMutating) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `${toolName} is not allowed in plan mode until Thinh approves ` +
      '(Approve unlocks mutating tools for exactly one turn)',
  };
}
