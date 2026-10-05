import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.js';

describe('resolveTheme', () => {
  it('follows the system preference only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
