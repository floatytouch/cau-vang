import type { NootEvent, NootEventMeta } from '@noot/shared';

/** Restamps events with the brain's session/turn ids and one gap-free seq per turn. */
export class TurnEventRelay {
  private seq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly turnId: string,
  ) {}

  /** Placeholder meta for brain-made events; `relay` overwrites it. */
  meta(): NootEventMeta {
    return { sessionId: this.sessionId, turnId: this.turnId, seq: this.seq, emittedAt: '' };
  }

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
