import { WS_PONG_EVENT } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway.js';

describe('RealtimeGateway', () => {
  it('answers a ping with a pong echoing the payload', () => {
    const reply = new RealtimeGateway().handlePing('hello');

    expect(reply.type).toBe(WS_PONG_EVENT);
    expect(reply.payload.echo).toBe('hello');
  });

  it('echoes an empty string for non-string payloads', () => {
    expect(new RealtimeGateway().handlePing({ unexpected: true }).payload.echo).toBe('');
  });
});
