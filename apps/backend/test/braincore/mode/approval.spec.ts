import { describe, expect, it } from 'vitest';
import { isApproval, MAX_APPROVAL_WORDS } from '../../../src/braincore/mode/approval.js';

describe('isApproval', () => {
  it.each([
    'ok',
    'yes',
    'go ahead',
    'làm đi',
    'đồng ý',
    'ok làm đi',
    'sure please',
    'OK!',
    'Được rồi anh',
  ])('accepts short approval %j', (text) => {
    expect(isApproval(text)).toBe(true);
  });

  it.each([
    'ok?',
    'what should we do',
    'please rewrite the whole module and then deploy it carefully',
    '',
    'maybe later',
    'ok đừng làm',
    'không được',
    'ok нет',
    'ok 不要',
    'ok ないで',
    'ok⁇',
    'ok⁈',
    'ok﹖',
    'ok❓',
    'ok;',
  ])('rejects non-approval %j', (text) => {
    expect(isApproval(text)).toBe(false);
  });

  it('rejects affirmations longer than the word cap', () => {
    const words = Array.from({ length: MAX_APPROVAL_WORDS + 1 }, () => 'ok');
    expect(isApproval(words.join(' '))).toBe(false);
  });
});
