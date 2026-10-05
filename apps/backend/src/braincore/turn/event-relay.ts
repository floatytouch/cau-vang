import type { NootEvent } from '@noot/shared';

export class TurnEventRelay {
  private seq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly turnId: string,
  ) {}

  relay(event: NootEvent): NootEvent {
    const relayed: NootEvent = {
      ...event,
      sessionId: this.sessionId,
      turnId: this.turnId,
      seq: this.seq,
      emittedAt: new Date().toISOString(),
    };
    this.seq += 1;
    return relayed;
  }
}
