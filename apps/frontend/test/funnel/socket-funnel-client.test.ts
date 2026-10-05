import { WS_CHAT_SEND_EVENT, WS_SUBSCRIBE_SESSION_EVENT } from '@noot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocketFunnelClient } from '../../src/funnel/socket-funnel-client.js';

interface EmittedFrame {
  event: string;
  payload: unknown;
  ack: (...args: unknown[]) => void;
}

/** Stands in for a socket.io-client Socket: records emits and lets the test drive the lifecycle. */
class FakeSocket {
  connected = false;
  active = false;
  readonly emitted: EmittedFrame[] = [];
  readonly handshakeAuth: unknown;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(options: { auth: unknown }) {
    this.handshakeAuth = options.auth;
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  once(event: string, listener: () => void): this {
    const wrapped = Object.assign(
      () => {
        this.off(event, wrapped);
        listener();
      },
      { original: listener },
    );
    return this.on(event, wrapped);
  }

  /** Like component-emitter, off() also removes a once() wrapper by its original listener. */
  off(event: string, listener: () => void): this {
    const set = this.listeners.get(event);
    for (const registered of [...(set ?? [])]) {
      const original = (registered as { original?: () => void }).original;
      if (registered === listener || original === listener) {
        set?.delete(registered);
      }
    }
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  connect(): void {
    this.active = true;
    if (acceptHandshake) {
      this.serverConnect();
    }
  }

  /** `retrying` mirrors socket.io: a transport failure keeps the socket active, a middleware refusal does not. */
  serverConnectError(retrying: boolean): void {
    this.active = retrying;
    this.fire('connect_error', new Error('handshake failed'));
  }

  serverConnect(): void {
    this.connected = true;
    this.fire('connect');
  }

  serverDisconnect(): void {
    this.connected = false;
    this.fire('disconnect');
  }

  disconnect(): void {
    this.serverDisconnect();
  }

  timeout(): { emit: FakeSocket['emit'] } {
    return {
      emit: (event: string, payload: unknown, ack: (...args: unknown[]) => void) =>
        this.record(event, payload, (value: unknown) => ack(null, value)),
    };
  }

  emit(event: string, payload?: unknown, ack?: (...args: unknown[]) => void): boolean {
    this.record(event, payload, ack ?? (() => {}));
    return true;
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }

  private record(event: string, payload: unknown, ack: (...args: unknown[]) => void): boolean {
    this.emitted.push({ event, payload, ack });
    return true;
  }
}

const sockets: FakeSocket[] = [];
let acceptHandshake = true;

vi.mock('socket.io-client', () => ({
  io: (_url: unknown, options: { auth: unknown }) => {
    const socket = new FakeSocket(options);
    sockets.push(socket);
    return socket;
  },
}));

afterEach(() => {
  sockets.length = 0;
  acceptHandshake = true;
});

async function connectedClient(wsToken?: string): Promise<[SocketFunnelClient, FakeSocket]> {
  const client = new SocketFunnelClient({ wsUrl: '', wsToken });
  await client.connect();
  return [client, sockets[0]!];
}

describe('SocketFunnelClient', () => {
  it('sends the token in the handshake only when one is configured', async () => {
    const [, withToken] = await connectedClient('secret-token');
    expect(withToken.handshakeAuth).toEqual({ token: 'secret-token' });
    sockets.length = 0;
    const [, withoutToken] = await connectedClient(undefined);
    expect(withoutToken.handshakeAuth).toStrictEqual({});
  });

  it('replays session subscriptions after a reconnect', async () => {
    const [client, socket] = await connectedClient();
    const subscribed = client.subscribeSession('session-1');
    socket.emitted[0]!.ack({ ok: true });
    expect(await subscribed).toEqual({ ok: true });

    socket.serverDisconnect();
    socket.emitted.length = 0;
    socket.serverConnect();

    expect(socket.emitted.map(({ event, payload }) => [event, payload])).toEqual([
      [WS_SUBSCRIBE_SESSION_EVENT, { sessionId: 'session-1' }],
    ]);
  });

  it('settles a running chat_send when the socket drops', async () => {
    const [client, socket] = await connectedClient();
    const sent = client.sendChat('session-1', 'hello');
    expect(socket.emitted.map(({ event }) => event)).toEqual([WS_CHAT_SEND_EVENT]);

    socket.serverDisconnect();

    expect(await sent).toEqual({ ok: false, error: 'funnel disconnected during chat_send' });
    expect(socket.listenerCount('disconnect')).toBe(1);
  });

  it('resolves chat_send with the server ack and drops its disconnect hook', async () => {
    const [client, socket] = await connectedClient();
    const sent = client.sendChat('session-1', 'hello');
    socket.emitted[0]!.ack({ ok: true, turnId: 'turn-1' });

    expect(await sent).toEqual({ ok: true, turnId: 'turn-1' });
    expect(socket.listenerCount('disconnect')).toBe(1);
  });

  it('keeps waiting through retryable connect errors until the backend comes up', async () => {
    acceptHandshake = false;
    const client = new SocketFunnelClient({ wsUrl: '', wsToken: undefined });
    let settled = false;
    const connecting = client.connect().finally(() => {
      settled = true;
    });
    const socket = sockets[0]!;

    socket.serverConnectError(true);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(client.connectionState).toBe('error');

    socket.serverConnect();
    await connecting;
    expect(client.connectionState).toBe('connected');
  });

  it('rejects connect when the server refuses the handshake', async () => {
    acceptHandshake = false;
    const client = new SocketFunnelClient({ wsUrl: '', wsToken: 'wrong' });
    const connecting = client.connect();

    sockets[0]!.serverConnectError(false);

    await expect(connecting).rejects.toThrow('handshake failed');
    expect(client.connectionState).toBe('error');
  });
});
