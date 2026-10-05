import { DEFAULT_BACKEND_PORT } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { resolvePort } from './port.js';

describe('resolvePort', () => {
  it('falls back to the shared default when PORT is unset or empty', () => {
    expect(resolvePort(undefined)).toBe(DEFAULT_BACKEND_PORT);
    expect(resolvePort('')).toBe(DEFAULT_BACKEND_PORT);
  });

  it('accepts a valid port', () => {
    expect(resolvePort('8080')).toBe(8080);
  });

  it.each(['abc', '0', '65536', '30.5', '-1'])('rejects %s', (rawPort) => {
    expect(() => resolvePort(rawPort)).toThrow(`Invalid PORT "${rawPort}"`);
  });
});
