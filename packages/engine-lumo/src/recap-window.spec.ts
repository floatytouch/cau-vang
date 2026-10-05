import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '@noot/shared';
import {
  HISTORY_CHAR_BUDGET,
  HISTORY_MESSAGE_CHARS,
  HISTORY_MESSAGE_LIMIT,
} from './recap-budget.js';
import { buildLumoChatMessages, historyWindow, totalHistoryCharsInWindow } from './recap-window.js';

function userMessage(text: string): ConversationMessage {
  return { role: 'user', text };
}

function assistantMessage(text: string): ConversationMessage {
  return { role: 'assistant', text };
}

describe('historyWindow', () => {
  it('keeps the newest messages within the char budget', () => {
    const history: ConversationMessage[] = [];
    for (let index = 0; index < 50; index += 1) {
      history.push(userMessage(`message-${index}-${'x'.repeat(500)}`));
    }

    const window = historyWindow(history);

    expect(window.length).toBeLessThanOrEqual(HISTORY_MESSAGE_LIMIT);
    expect(totalHistoryCharsInWindow(history)).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET);
    expect(window.at(-1)?.content).toContain('message-49');
  });

  it('truncates a single message longer than HISTORY_MESSAGE_CHARS', () => {
    const longText = 'a'.repeat(HISTORY_MESSAGE_CHARS + 100);
    const window = historyWindow([userMessage(longText)]);

    expect(window).toHaveLength(1);
    expect(window[0]?.content.length).toBe(HISTORY_MESSAGE_CHARS);
    expect(window[0]?.content.endsWith('...')).toBe(true);
  });

  it('drops empty messages after whitespace collapse', () => {
    const window = historyWindow([userMessage('   \n\t  ')]);
    expect(window).toHaveLength(0);
  });
});

describe('buildLumoChatMessages', () => {
  it('places system, windowed history, then the user turn', () => {
    const messages = buildLumoChatMessages(
      'persona',
      [assistantMessage('hi'), userMessage('there')],
      'new',
    );

    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'assistant',
      'user',
      'user',
    ]);
    expect(messages[0]?.content).toBe('persona');
    expect(messages.at(-1)?.content).toBe('new');
  });
});
