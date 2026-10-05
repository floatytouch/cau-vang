import type { NootEventMeta } from '@noot/shared';

export class TurnEventBuilder {
  private seq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly turnId: string,
  ) {}

  meta(): NootEventMeta {
    const event: NootEventMeta = {
      sessionId: this.sessionId,
      turnId: this.turnId,
      seq: this.seq,
      emittedAt: new Date().toISOString(),
    };
    this.seq += 1;
    return event;
  }
}
