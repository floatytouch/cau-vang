import type { Run } from '@cursor/sdk';

/** Cancel/timeout state of one turn; every stop path funnels through here. */
export class TurnControl {
  private run?: Run;
  cancelRequested = false;
  timedOut = false;
  /** Set when the SDK refused or failed to cancel the run. */
  stopFailure?: string;
  private signalStop: () => void = () => {};
  private readonly stopped = new Promise<void>((resolve) => {
    this.signalStop = resolve;
  });

  get stopRequested(): boolean {
    return this.cancelRequested || this.timedOut;
  }

  async requestCancel(): Promise<void> {
    if (this.cancelRequested) {
      return;
    }
    this.cancelRequested = true;
    this.signalStop();
    await this.stopRun();
  }

  expire(): void {
    this.timedOut = true;
    this.signalStop();
    void this.stopRun();
  }

  /** Attaches the started run; a stop requested before it arrived is applied now. */
  async attach(run: Run): Promise<void> {
    this.run = run;
    if (this.stopRequested) {
      await this.stopRun();
    }
  }

  /**
   * Resolves with the work's value, or undefined when the turn is stopped first.
   * A value that arrives after the stop is handed to `onLate` for cleanup.
   */
  async unlessStopped<T>(
    work: Promise<T>,
    onLate: (value: T) => Promise<void>,
  ): Promise<T | undefined> {
    const outcome = await Promise.race([
      work.then((value) => ({ value })),
      this.stopped.then(() => undefined),
    ]);
    if (outcome === undefined) {
      // The turn already ended with done; a late failure has no consumer and nothing to clean up.
      work.then(onLate).catch(() => undefined);
    }
    return outcome?.value;
  }

  /** Cancels the run if it is still going; never throws, records the failure instead. */
  async stopRun(): Promise<void> {
    const run = this.run;
    if (run === undefined || run.status !== 'running') {
      return;
    }
    if (!run.supports('cancel')) {
      const reason = run.unsupportedReason('cancel') ?? 'unsupported';
      this.stopFailure = `Cursor run ${run.id} cannot be cancelled: ${reason}`;
      return;
    }
    try {
      await run.cancel();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.stopFailure = `Cancelling Cursor run ${run.id} failed: ${reason}`;
    }
  }
}
