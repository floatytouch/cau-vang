import { createHash, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';
import { WS_AUTH_TOKEN_KEY } from '@noot/shared';

export const WS_UNAUTHORIZED_MESSAGE = 'invalid or missing websocket token';

/** Read the shared WS token from the Socket.IO handshake `auth` payload (never log the value). */
export function readHandshakeToken(socket: Socket): string | undefined {
  const value = (socket.handshake.auth as Record<string, unknown>)[WS_AUTH_TOKEN_KEY];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function handshakeTokenMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) {
    return false;
  }
  // Fixed-size digests keep timingSafeEqual from throwing and avoid leaking the token length.
  return timingSafeEqual(sha256(presented), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
