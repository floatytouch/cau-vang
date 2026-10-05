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
      events: [textEvent('kept reply', 0), doneEvent(1)],
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
    const sessionId = (await funnel.listSessions())[0]!.id;
    expect(await funnel.getHistory(sessionId)).toMatchObject({ engineId: 'mock-harness' });
  });

  it('disables choices from an earlier turn once the user types a new message', async () => {
    const funnel = new MockFunnel();
    render(<App funnel={funnel} />);
    await screen.findByText('Funnel: Connected');

    await sendMessage('first');
    const optionA = (await screen.findByRole('button', { name: 'Option A' })) as HTMLButtonElement;
    await waitFor(() => expect(optionA.disabled).toBe(false));

    await sendMessage('typed instead');
    expect(await screen.findByText('echo: typed instead')).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
    expect(optionA.disabled).toBe(true);
  });

  it('settles the composer when the send ack arrives without a done event', async () => {
    const funnel = new MockFunnel({ events: [textEvent('half a reply', 0)] });
    render(<App funnel={funnel} />);
    await screen.findByText('Funnel: Connected');

    await sendMessage('no done please');

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('settles and reports when the funnel drops mid-turn', async () => {
    const funnel = new MockFunnel({
      events: [textEvent('partial', 0)],
      sendFailure: 'funnel disconnected during chat_send',
    });
    render(<App funnel={funnel} />);
    await screen.findByText('Funnel: Connected');

    await sendMessage('drop me');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'funnel disconnected during chat_send',
    );
    expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

async function sendMessage(text: string): Promise<void> {
  const draft = screen.getByLabelText('Message') as HTMLTextAreaElement;
  await waitFor(() => expect(draft.disabled).toBe(false));
  fireEvent.change(draft, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

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
