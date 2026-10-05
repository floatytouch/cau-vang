import { describe, expect, it } from 'vitest';
import { createMockRun } from '../src/testing/mock-cursor-sdk.js';
import { TurnControl } from '../src/turn-control.js';

describe('TurnControl', () => {
  it('stops a run attached after the cancel was requested', async () => {
    const control = new TurnControl();
    const run = createMockRun({ holdOpen: true });

    await control.requestCancel();
    await control.attach(run);

    expect(run.cancelCalls).toBe(1);
  });

  it('leaves a run attached without a stop request running', async () => {
    const control = new TurnControl();
    const run = createMockRun({ holdOpen: true });

    await control.attach(run);

    expect(run.cancelCalls).toBe(0);
  });

  it('returns undefined once stopped and hands the late value to cleanup', async () => {
    const control = new TurnControl();
    const lateValues: string[] = [];
    let deliver: (value: string) => void = () => {};
    const work = new Promise<string>((resolve) => (deliver = resolve));

    const pending = control.unlessStopped(work, async (value) => {
      lateValues.push(value);
    });
    control.expire();
    const outcome = await pending;
    deliver('late');
    await work;
    await Promise.resolve();

    expect(outcome).toBeUndefined();
    expect(control.timedOut).toBe(true);
    expect(lateValues).toEqual(['late']);
  });
});
