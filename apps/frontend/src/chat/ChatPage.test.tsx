import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.js';
import { MockFunnel } from '../funnel/mock-funnel.js';
import type { NootEvent } from '@noot/shared';

afterEach(() => {
  cleanup();
});

describe('Chat UI against a mock funnel', () => {
  it('streams text, shows thinking, and lets the user pick a choice once', async () => {
    const funnel = new MockFunnel();
    render(<App funnel={funnel} />);

    expect(await screen.findByText('Funnel: Connected')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello funnel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('considering the reply')).toBeTruthy();
    expect(await screen.findByText('echo: hello funnel')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Option A' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Option A' }));

    await waitFor(() => {
      expect(funnel.sentChoices).toContain('Option A');
    });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Option A' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
  });

  it('Stop cancels an in-flight stream', async () => {
    const funnel = new MockFunnel({
      eventGapMs: 30,
      events: longStreamEvents(),
      cancelEndsStream: true,
    });
    render(<App funnel={funnel} />);
    await screen.findByText('Funnel: Connected');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'slow turn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const stop = await screen.findByRole('button', { name: 'Stop' });
    await waitFor(() => {
      expect((stop as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(stop);

    expect(await screen.findByText('Stopped')).toBeTruthy();
    expect(funnel.cancelledSessions.length).toBeGreaterThan(0);
  });

  it('model picker changes engine without dropping history', async () => {
    const funnel = new MockFunnel({
      events: [
        textEvent('kept reply', 0),
        doneEvent(1),
      ],
    });
    render(<App funnel={funnel} />);
    await screen.findByText('Funnel: Connected');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'remember this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('remember this')).toBeTruthy();
    expect(await screen.findByText('kept reply')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'mock-harness' } });

    await waitFor(() => {
      expect((screen.getByLabelText('Engine') as HTMLSelectElement).value).toBe('mock-harness');
    });
    expect(screen.getByText('remember this')).toBeTruthy();
    expect(screen.getByText('kept reply')).toBeTruthy();
  });
});

function longStreamEvents(): NootEvent[] {
  return [
    {
      sessionId: 'x',
      turnId: 't',
      seq: 0,
      emittedAt: '2026-10-05T00:00:00.000Z',
      type: 'thinking_delta',
      text: 'still thinking',
    },
    {
      sessionId: 'x',
      turnId: 't',
      seq: 1,
      emittedAt: '2026-10-05T00:00:00.000Z',
      type: 'text_delta',
      text: 'chunk-one ',
    },
    {
      sessionId: 'x',
      turnId: 't',
      seq: 2,
      emittedAt: '2026-10-05T00:00:00.000Z',
      type: 'text_delta',
      text: 'chunk-two',
    },
    doneEvent(3),
  ];
}

function textEvent(text: string, seq: number): NootEvent {
  return {
    sessionId: 'x',
    turnId: 't',
    seq,
    emittedAt: '2026-10-05T00:00:00.000Z',
    type: 'text_delta',
    text,
  };
}

function doneEvent(seq: number): NootEvent {
  return {
    sessionId: 'x',
    turnId: 't',
    seq,
    emittedAt: '2026-10-05T00:00:00.000Z',
    type: 'done',
    reason: 'completed',
  };
}
