import { describe, expect, it } from 'vitest';
import { isApproval, MAX_APPROVAL_WORDS } from './approval.js';

describe('isApproval', () => {
  it.each(['ok', 'yes', 'go ahead', 'làm đi', 'đồng ý', 'ok làm đi', 'sure please'])(
    'accepts short approval %j',
    (text) => {
      expect(isApproval(text)).toBe(true);
    },
  );

  it.each([
    'ok?',
    'what should we do',
    'please rewrite the whole module and then deploy it carefully',
    '',
    'maybe later',
  ])('rejects non-approval %j', (text) => {
    expect(isApproval(text)).toBe(false);
  });

  it('rejects affirmations longer than the word cap', () => {
    const words = Array.from({ length: MAX_APPROVAL_WORDS + 1 }, () => 'ok');
    expect(isApproval(words.join(' '))).toBe(false);
  });
});
