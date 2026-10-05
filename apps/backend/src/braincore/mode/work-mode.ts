export const WORK_MODE_AUTO = 'auto' as const;
export const WORK_MODE_PLAN = 'plan' as const;

export const WORK_MODES = [WORK_MODE_AUTO, WORK_MODE_PLAN] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const DEFAULT_WORK_MODE: WorkMode = WORK_MODE_AUTO;
/** Corrupt or unparseable persisted mode keeps the gate closed. */
export const SAFE_WORK_MODE: WorkMode = WORK_MODE_PLAN;

export function isWorkMode(value: unknown): value is WorkMode {
  return value === WORK_MODE_AUTO || value === WORK_MODE_PLAN;
}

/** An absent key (pre-mode session file) defaults to auto; any other value fails closed to plan. */
export function normalizeWorkMode(value: unknown): WorkMode {
  if (value === undefined) {
    return DEFAULT_WORK_MODE;
  }
  if (isWorkMode(value)) {
    return value;
  }
  return SAFE_WORK_MODE;
}

export function invalidWorkModeMessage(value: unknown): string {
  return `invalid mode: ${JSON.stringify(value)} (choose: ${WORK_MODES.join(', ')})`;
}
