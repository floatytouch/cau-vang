import type { ConversationMessage } from '@noot/shared';
import { DEFAULT_LUMO_RECAP_BUDGETS, type LumoRecapBudgets } from './recap-budget.js';

export interface LumoWireMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildLumoChatMessages(
  systemPrompt: string,
  history: readonly ConversationMessage[],
  userText: string,
  budgets: LumoRecapBudgets = DEFAULT_LUMO_RECAP_BUDGETS,
): LumoWireMessage[] {
  const messages: LumoWireMessage[] = [{ role: 'system', content: systemPrompt }];
  messages.push(...historyWindow(history, budgets));
  messages.push({ role: 'user', content: userText });
  return messages;
}

export function historyWindow(
  history: readonly ConversationMessage[],
  budgets: LumoRecapBudgets = DEFAULT_LUMO_RECAP_BUDGETS,
): LumoWireMessage[] {
  const window: LumoWireMessage[] = [];
  let budget = budgets.charBudget;
  const slice = history.slice(-budgets.messageLimit);

  for (let index = slice.length - 1; index >= 0; index -= 1) {
    const message = slice[index];
    if (!message) {
      continue;
    }
    const content = normalizeMessageText(message.text, budgets.messageChars);
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

function normalizeMessageText(text: string, messageChars: number): string {
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ');
  if (collapsed.length <= messageChars) {
    return collapsed;
  }
  return `${collapsed.slice(0, messageChars - 3)}...`;
}
