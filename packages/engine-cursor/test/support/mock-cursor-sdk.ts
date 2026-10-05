import type { Run, RunResult, RunStatus, SDKAgent, SDKMessage, SendOptions } from '@cursor/sdk';
import type { NootEvent, TurnOptions } from '@noot/shared';

export interface MockRunScript {
  messages?: SDKMessage[];
  /** Keep the stream open after the messages until the run is cancelled. */
  holdOpen?: boolean;
  /** Throw from the stream after the messages. */
  streamError?: Error;
  result?: Partial<RunResult>;
  cancelError?: Error;
}

export interface MockRun extends Run {
  readonly cancelCalls: number;
}

export function createMockRun(script: MockRunScript = {}): MockRun {
  let status: RunStatus = 'running';
  let cancelCalls = 0;
  let releaseHold: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });

  return {
    id: 'run-1',
    agentId: 'agent-1',
    get status() {
      return status;
    },
    get cancelCalls() {
      return cancelCalls;
    },
    supports: () => true,
    unsupportedReason: () => undefined,
    async *stream() {
      yield* script.messages ?? [];
      if (script.streamError !== undefined) {
        throw script.streamError;
      }
      if (script.holdOpen === true) {
        await held;
      }
    },
    conversation: async () => [],
    wait: async () => {
      if (status === 'running') {
        status = (script.result?.status as RunStatus | undefined) ?? 'finished';
      }
      return { id: 'run-1', status: status as RunResult['status'], ...script.result };
    },
    cancel: async () => {
      cancelCalls += 1;
      // A real cancel is an RPC: the status flips only after a round trip.
      await Promise.resolve();
      if (script.cancelError !== undefined) {
        throw script.cancelError;
      }
      status = 'cancelled';
      releaseHold();
    },
    onDidChangeStatus: () => () => {},
  };
}

export interface MockAgent {
  agent: SDKAgent;
  sendCalls: Array<SendOptions | undefined>;
}

export function createMockAgent(send: () => Promise<Run>): MockAgent {
  const sendCalls: Array<SendOptions | undefined> = [];
  const agent = {
    send: async (_message: string, options?: SendOptions) => {
      sendCalls.push(options);
      return send();
    },
    close: () => {},
  } as unknown as SDKAgent;
  return { agent, sendCalls };
}

export const TURN_OPTIONS: TurnOptions = {
  turnId: 't1',
  model: 'composer-2.5',
  systemPrompt: 'You are Not.',
};

export async function collect(stream: AsyncIterable<NootEvent>): Promise<NootEvent[]> {
  const events: NootEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

export function eventTypes(events: NootEvent[]): string[] {
  return events.map((event) => event.type);
}
