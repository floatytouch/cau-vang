import type { ChoiceOption } from '@noot/shared';

/** User text containing this substring triggers a fixture `choices` event before `done`. */
export const OFFLINE_RULES_SHOW_CHOICES_MARKER = 'SHOW_CHOICES';

export const DEFAULT_OFFLINE_MAX_ECHO_CHARS = 4000;

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const DEFAULT_OFFLINE_CHOICE_FIXTURE: Readonly<{
  prompt: string;
  options: ChoiceOption[];
}> = {
  prompt: 'Pick one',
  options: [
    { id: 'a', label: 'Option A' },
    { id: 'b', label: 'Option B' },
  ],
};

export function shouldEmitOfflineChoices(userText: string): boolean {
  return userText.includes(OFFLINE_RULES_SHOW_CHOICES_MARKER);
}

export function formatOfflineEcho(userText: string, maxChars: number): string {
  const sanitized = userText.replace(CONTROL_CHAR_PATTERN, '').trim();
  if (sanitized.length <= maxChars) {
    return `echo: ${sanitized}`;
  }
  const truncated = sanitized.slice(0, maxChars - 1);
  return `echo: ${truncated}...`;
}
