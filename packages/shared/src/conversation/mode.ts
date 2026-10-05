export const CONVERSATION_MODE_AUTO = 'auto' as const;
export const CONVERSATION_MODE_PLAN = 'plan' as const;

export const CONVERSATION_MODES = [CONVERSATION_MODE_AUTO, CONVERSATION_MODE_PLAN] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const DEFAULT_CONVERSATION_MODE: ConversationMode = CONVERSATION_MODE_AUTO;

export function isConversationMode(value: unknown): value is ConversationMode {
  return typeof value === 'string' && (CONVERSATION_MODES as readonly string[]).includes(value);
}
