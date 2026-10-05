import type { ConversationMessage } from '@noot/shared';
import {
  HISTORY_CHAR_BUDGET,
  HISTORY_MESSAGE_CHARS,
  HISTORY_MESSAGE_LIMIT,
} from './recap-budget.js';

export interface LumoWireMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildLumoChatMessages(
  systemPrompt: string,
  history: readonly ConversationMessage[],
  userText: string,
): LumoWireMessage[] {
  const messages: LumoWireMessage[] = [{ role: 'system', content: systemPrompt }];
  messages.push(...historyWindow(history));
  messages.push({ role: 'user', content: userText });
  return messages;
}

export function historyWindow(history: readonly ConversationMessage[]): LumoWireMessage[] {
  const window: LumoWireMessage[] = [];
  let budget = HISTORY_CHAR_BUDGET;
  const slice = history.slice(-HISTORY_MESSAGE_LIMIT);

  for (let index = slice.length - 1; index >= 0; index -= 1) {
    const message = slice[index];
    if (!message) {
      continue;
    }
    const content = normalizeMessageText(message.text);
    if (!content) {
      continue;
    }
    if (content.length > budget) {
      break;
    }
    budget -= content.length;
    window.push({ role: message.role, content });
  }

  window.reverse();
  return window;
}

export function totalHistoryCharsInWindow(history: readonly ConversationMessage[]): number {
  return historyWindow(history).reduce((sum, message) => sum + message.content.length, 0);
}

function normalizeMessageText(text: string): string {
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ');
  if (collapsed.length <= HISTORY_MESSAGE_CHARS) {
    return collapsed;
  }
  return `${collapsed.slice(0, HISTORY_MESSAGE_CHARS - 3)}...`;
}
