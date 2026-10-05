import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCursorApiKey } from './resolve-api-key.js';

describe('resolveCursorApiKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers an explicit key over CURSOR_API_KEY', () => {
    vi.stubEnv('CURSOR_API_KEY', 'env_key');
    expect(resolveCursorApiKey('explicit_key')).toBe('explicit_key');
  });

  it('throws when the explicit key is empty', () => {
    expect(() => resolveCursorApiKey('')).toThrow(/empty string/);
  });

  it('falls back to CURSOR_API_KEY', () => {
    vi.stubEnv('CURSOR_API_KEY', 'env_key');
    expect(resolveCursorApiKey()).toBe('env_key');
  });

  it('returns undefined for the stored-login path when nothing is configured', () => {
    vi.stubEnv('CURSOR_API_KEY', '');
    expect(resolveCursorApiKey()).toBeUndefined();
  });
});
