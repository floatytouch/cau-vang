import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCursorApiKey } from './resolve-api-key.js';

describe('resolveCursorApiKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a non-empty explicit key', () => {
    expect(resolveCursorApiKey('explicit_key')).toBe('explicit_key');
  });

  it('throws when the explicit key is empty', () => {
    expect(() => resolveCursorApiKey('')).toThrow(/empty string/);
  });

  it('returns undefined when no key is provided so the SDK can use stored login', () => {
    expect(resolveCursorApiKey()).toBeUndefined();
  });

  it('ignores CURSOR_API_KEY in the environment (host config must pass apiKey)', () => {
    vi.stubEnv('CURSOR_API_KEY', 'env_key');
    expect(resolveCursorApiKey()).toBeUndefined();
    expect(resolveCursorApiKey('explicit_key')).toBe('explicit_key');
  });
});
