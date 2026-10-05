/** Minimal Socket.IO v5 client over the built-in WebSocket: connect, emit-with-ack, collect events. */
export class RawSocketIoClient {
  private nextAckId = 0;
  private readonly acks = new Map<number, (value: unknown) => void>();
  readonly events: { name: string; payload: unknown }[] = [];
  private connected!: () => void;
  private failed!: (error: unknown) => void;
  readonly ready: Promise<void>;
  connectError: unknown;

  private constructor(
    private readonly socket: WebSocket,
    private readonly auth: object | undefined,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.connected = resolve;
      this.failed = reject;
    });
    socket.addEventListener('message', (message) => this.onFrame(String(message.data)));
    socket.addEventListener('close', () => {
      this.failed(new Error('socket closed before namespace connect'));
    });
  }

  /** Open a connection; `auth` rides in the CONNECT packet, `query` in the upgrade URL. */
  static open(
    port: number,
    options: { auth?: object; query?: Record<string, string> } = {},
  ): RawSocketIoClient {
    const params = new URLSearchParams({ ...options.query, EIO: '4', transport: 'websocket' });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?${params}`);
    return new RawSocketIoClient(socket, options.auth);
  }

  /** Resolve with the server's CONNECT_ERROR payload; reject if the connect succeeds instead. */
  async rejection(): Promise<unknown> {
    try {
      await this.ready;
    } catch {
      return this.connectError;
    }
    throw new Error('expected the namespace connect to be rejected');
  }

  emit(name: string, payload: unknown): Promise<unknown> {
    const ackId = this.nextAckId++;
    this.socket.send(`42${ackId}${JSON.stringify([name, payload])}`);
    return new Promise((resolve) => this.acks.set(ackId, resolve));
  }

  close(): void {
    this.socket.close();
  }

  private onFrame(frame: string): void {
    if (frame.startsWith('0')) {
      this.socket.send(this.auth === undefined ? '40' : `40${JSON.stringify(this.auth)}`);
    } else if (frame === '2') {
      this.socket.send('3');
    } else if (frame.startsWith('40')) {
      this.connected();
    } else if (frame.startsWith('44')) {
      this.connectError = JSON.parse(frame.slice(2)) as unknown;
      this.failed(this.connectError);
    } else if (frame.startsWith('43')) {
      const match = /^43(\d+)(.*)$/s.exec(frame);
      const [payload] = JSON.parse(match![2]!) as unknown[];
      this.acks.get(Number(match![1]))?.(payload);
    } else if (frame.startsWith('42')) {
      const [name, payload] = JSON.parse(frame.slice(2)) as [string, unknown];
      this.events.push({ name, payload });
    }
  }
}
