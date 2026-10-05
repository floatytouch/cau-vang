import { timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';
import { WS_AUTH_TOKEN_KEY } from '@noot/shared';

export const WS_UNAUTHORIZED_MESSAGE = 'invalid or missing websocket token';

/** Read the shared WS token from Socket.IO handshake auth or query (never log the value). */
export function readHandshakeToken(socket: Socket): string | undefined {
  const fromAuth = readRecordString(socket.handshake.auth, WS_AUTH_TOKEN_KEY);
  if (fromAuth !== undefined) {
    return fromAuth;
  }
  return readQueryString(socket.handshake.query[WS_AUTH_TOKEN_KEY]);
}

export function handshakeTokenMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) {
    return false;
  }
  const presentedBuffer = Buffer.from(presented);
  const expectedBuffer = Buffer.from(expected);
  if (presentedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(presentedBuffer, expectedBuffer);
}

function readRecordString(record: object, key: string): string | undefined {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readQueryString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}
