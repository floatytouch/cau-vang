import { describe, expect, it } from 'vitest';
import { resolveCursorApiKey } from './resolve-api-key.js';

describe('resolveCursorApiKey', () => {
  it('returns an explicit key when provided', () => {
    expect(resolveCursorApiKey('cursor_test_key')).toBe('cursor_test_key');
  });

  it('throws when the explicit key is empty', () => {
    expect(() => resolveCursorApiKey('')).toThrow(/empty string/);
  });
});
