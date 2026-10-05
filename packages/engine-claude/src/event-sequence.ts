import type { NootEventMeta } from '@noot/shared';

export class EventSequence {
  private nextSeq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly turnId: string,
  ) {}

  meta(): NootEventMeta {
    const emittedAt = new Date().toISOString();
    const seq = this.nextSeq;
    this.nextSeq += 1;
    return { sessionId: this.sessionId, turnId: this.turnId, seq, emittedAt };
  }
}
