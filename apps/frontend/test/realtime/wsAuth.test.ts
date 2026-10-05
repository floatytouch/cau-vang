import { buildWsAuth } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { frontendWsAuth, readFrontendWsToken } from '../../src/realtime/wsAuth.js';

describe('frontend WS auth helpers', () => {
  it('reads a trimmed VITE_NOOT_WS_TOKEN', () => {
    expect(readFrontendWsToken({ VITE_NOOT_WS_TOKEN: '  secret  ' })).toBe('secret');
    expect(readFrontendWsToken({})).toBeUndefined();
  });

  it('builds the shared auth object when a token is present', () => {
    expect(frontendWsAuth({ VITE_NOOT_WS_TOKEN: 'secret' })).toEqual(buildWsAuth('secret'));
    expect(frontendWsAuth({ VITE_NOOT_WS_TOKEN: 'secret' })).toEqual({
      token: 'secret',
    });
  });
});
