import { describe, expect, it } from 'vitest';
import { WS_AUTH_TOKEN_KEY } from '@noot/shared';
import { handshakeTokenMatches, readHandshakeToken } from './ws-auth.js';

function fakeSocket(handshake: {
  auth: object;
  query?: Record<string, string | string[] | undefined>;
}): Parameters<typeof readHandshakeToken>[0] {
  return { handshake } as Parameters<typeof readHandshakeToken>[0];
}

describe('ws-auth', () => {
  it('reads the token from handshake.auth', () => {
    expect(readHandshakeToken(fakeSocket({ auth: { [WS_AUTH_TOKEN_KEY]: 'from-auth' } }))).toBe(
      'from-auth',
    );
  });

  it('ignores a query string token so secrets never ride in URLs', () => {
    const socket = fakeSocket({ auth: {}, query: { [WS_AUTH_TOKEN_KEY]: 'from-query' } });
    expect(readHandshakeToken(socket)).toBeUndefined();
  });

  it('ignores non-string or empty auth tokens', () => {
    expect(readHandshakeToken(fakeSocket({ auth: { [WS_AUTH_TOKEN_KEY]: '' } }))).toBeUndefined();
    expect(
      readHandshakeToken(fakeSocket({ auth: { [WS_AUTH_TOKEN_KEY]: ['x'] } })),
    ).toBeUndefined();
  });

  it('accepts only the exact token', () => {
    expect(handshakeTokenMatches('secret', 'secret')).toBe(true);
    expect(handshakeTokenMatches(undefined, 'secret')).toBe(false);
    expect(handshakeTokenMatches('', 'secret')).toBe(false);
    expect(handshakeTokenMatches('secreT', 'secret')).toBe(false);
    expect(handshakeTokenMatches('secret-longer', 'secret')).toBe(false);
  });

  it('compares unicode and very long tokens without throwing', () => {
    expect(handshakeTokenMatches('mật-khẩu', 'mật-khẩu')).toBe(true);
    expect(handshakeTokenMatches('mat-khau', 'mật-khẩu')).toBe(false);
    expect(handshakeTokenMatches('x'.repeat(100_000), 'secret')).toBe(false);
  });
});
