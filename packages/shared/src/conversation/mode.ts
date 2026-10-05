export const CONVERSATION_MODES = ['auto', 'plan'] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const DEFAULT_CONVERSATION_MODE: ConversationMode = 'auto';

export function isConversationMode(value: unknown): value is ConversationMode {
  return typeof value === 'string' && (CONVERSATION_MODES as readonly string[]).includes(value);
}
