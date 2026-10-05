import { describe, expect, it } from 'vitest';
import { isConversationMode } from './mode.js';

describe('isConversationMode', () => {
  it('accepts only auto and plan', () => {
    expect(isConversationMode('auto')).toBe(true);
    expect(isConversationMode('plan')).toBe(true);
    expect(isConversationMode('Approve')).toBe(false);
    expect(isConversationMode(1)).toBe(false);
  });
});
