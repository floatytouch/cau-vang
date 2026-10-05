import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '@noot/shared';
import {
  HISTORY_CHAR_BUDGET,
  HISTORY_MESSAGE_CHARS,
  HISTORY_MESSAGE_LIMIT,
} from './recap-budget.js';
import { buildLumoChatMessages, historyWindow, type LumoWireMessage } from './recap-window.js';

function userMessage(text: string): ConversationMessage {
  return { role: 'user', text };
}

function windowChars(window: readonly LumoWireMessage[]): number {
  return window.reduce((sum, message) => sum + message.content.length, 0);
}

function assistantMessage(text: string): ConversationMessage {
  return { role: 'assistant', text };
}

describe('historyWindow', () => {
  it('keeps at most HISTORY_MESSAGE_LIMIT of the newest messages', () => {
    const history: ConversationMessage[] = [];
    for (let index = 0; index < 50; index += 1) {
      history.push(userMessage(`message-${index}-${'x'.repeat(500)}`));
    }

    const window = historyWindow(history);

    expect(window).toHaveLength(HISTORY_MESSAGE_LIMIT);
    expect(window[0]?.content).toContain('message-10-');
    expect(window.at(-1)?.content).toContain('message-49-');
  });

  it('stops at the char budget even when the message limit is not reached', () => {
    const history: ConversationMessage[] = [];
    for (let index = 0; index < 10; index += 1) {
      history.push(userMessage(`m${index}-${'x'.repeat(HISTORY_MESSAGE_CHARS)}`));
    }

    const window = historyWindow(history);

    expect(windowChars(window)).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET);
    expect(window).toHaveLength(Math.floor(HISTORY_CHAR_BUDGET / HISTORY_MESSAGE_CHARS));
    expect(window.at(-1)?.content.startsWith('m9-')).toBe(true);
  });

  it('honours factory budget overrides instead of the package defaults', () => {
    const budgets = { charBudget: 20, messageLimit: 10, messageChars: 50 };
    const history = [
      userMessage('aaaaaaaaaa'),
      userMessage('bbbbbbbbbb'),
      userMessage('cccccccccc'),
    ];

    const window = historyWindow(history, budgets);

    expect(windowChars(window)).toBeLessThanOrEqual(budgets.charBudget);
    expect(window.map((message) => message.content)).toEqual(['bbbbbbbbbb', 'cccccccccc']);
  });

  it('drops everything older than the first message that overflows the budget', () => {
    const filler = 'y'.repeat(HISTORY_MESSAGE_CHARS);
    const fillerCount = Math.floor(HISTORY_CHAR_BUDGET / HISTORY_MESSAGE_CHARS) - 1;
    const history: ConversationMessage[] = [
      userMessage('oldest short'),
      assistantMessage(filler),
      ...Array.from({ length: fillerCount }, () => assistantMessage(filler)),
      userMessage('newest short'),
    ];

    const window = historyWindow(history);

    expect(window.map((message) => message.content)).not.toContain('oldest short');
    expect(window.at(-1)?.content).toBe('newest short');
    expect(windowChars(window)).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET);
  });

  it('returns an empty window for an empty history', () => {
    expect(historyWindow([])).toEqual([]);
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
