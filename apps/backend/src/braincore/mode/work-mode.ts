import {
  CONVERSATION_MODE_AUTO,
  CONVERSATION_MODE_PLAN,
  CONVERSATION_MODES,
  DEFAULT_CONVERSATION_MODE,
  isConversationMode,
  type ConversationMode,
} from '@noot/shared';

// Gate/persistence keeps WORK_MODE_* so this layer does not read as shared wire names.
export const WORK_MODE_AUTO = CONVERSATION_MODE_AUTO;
export const WORK_MODE_PLAN = CONVERSATION_MODE_PLAN;
export const WORK_MODES = CONVERSATION_MODES;
export type WorkMode = ConversationMode;

export const DEFAULT_WORK_MODE: WorkMode = DEFAULT_CONVERSATION_MODE;
/** Corrupt or unparseable persisted mode keeps the gate closed. */
export const SAFE_WORK_MODE: WorkMode = WORK_MODE_PLAN;

export function isWorkMode(value: unknown): value is WorkMode {
  return isConversationMode(value);
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
