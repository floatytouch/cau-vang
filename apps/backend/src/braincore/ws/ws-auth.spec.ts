import { describe, expect, it } from 'vitest';
import { WS_AUTH_TOKEN_KEY } from '@noot/shared';
import { handshakeTokenMatches, readHandshakeToken } from './ws-auth.js';

function fakeSocket(handshake: {
  auth?: object;
  query?: Record<string, string | string[] | undefined>;
}): Parameters<typeof readHandshakeToken>[0] {
  return { handshake } as Parameters<typeof readHandshakeToken>[0];
}

describe('ws-auth', () => {
  it('reads the token from handshake.auth first', () => {
    const socket = fakeSocket({
      auth: { [WS_AUTH_TOKEN_KEY]: 'from-auth' },
      query: { [WS_AUTH_TOKEN_KEY]: 'from-query' },
    });
    expect(readHandshakeToken(socket)).toBe('from-auth');
  });

  it('falls back to the query string token', () => {
    const socket = fakeSocket({
      auth: {},
      query: { [WS_AUTH_TOKEN_KEY]: 'from-query' },
    });
    expect(readHandshakeToken(socket)).toBe('from-query');
  });

  it('rejects empty or missing presented tokens', () => {
    expect(handshakeTokenMatches(undefined, 'secret')).toBe(false);
    expect(handshakeTokenMatches('', 'secret')).toBe(false);
    expect(handshakeTokenMatches('secret', 'secret')).toBe(true);
    expect(handshakeTokenMatches('wrong', 'secret')).toBe(false);
  });
});
