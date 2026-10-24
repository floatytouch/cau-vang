import type { ConversationMessage } from '@noot/shared';

export interface OpenAiWireMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildOpenAiMessages(
  systemPrompt: string,
  history: readonly ConversationMessage[],
  userText: string,
): OpenAiWireMessage[] {
  const messages: OpenAiWireMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const entry of history) {
    messages.push({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.text,
    });
  }
  messages.push({ role: 'user', content: userText });
  return messages;
}
