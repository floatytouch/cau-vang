import {
  DEFAULT_CONVERSATION_MODE,
  DONE_REASON_CANCELLED,
  DONE_REASON_COMPLETED,
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  type ConversationMode,
  type EngineSummary,
  type FunnelAck,
  type HistoryMessageDto,
  type NootEvent,
  type SessionSummaryDto,
} from '@noot/shared';
import type { FunnelConnectionState, FunnelPort } from '../../src/funnel/funnel-port.js';

export interface MockFunnelScript {
  events?: NootEvent[];
  /** Delay between scripted events in ms. */
  eventGapMs?: number;
  cancelEndsStream?: boolean;
  /** When set, chat_send fails with this error after streaming the scripted events. */
  sendFailure?: string;
}

interface MockSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  engineId: string;
  model: string;
  mode: ConversationMode;
  history: HistoryMessageDto[];
}

const MOCK_ENGINES: EngineSummary[] = [
  {
    id: 'mock',
    capabilities: {
      toolLoop: 'bareApi',
      thinkingStream: true,
      sessions: false,
      choices: true,
    },
  },
  {
    id: 'mock-harness',
    capabilities: {
      toolLoop: 'ownToolLoop',
      thinkingStream: false,
      sessions: true,
      choices: false,
    },
  },
];

export class MockFunnel implements FunnelPort {
  connectionState: FunnelConnectionState = 'disconnected';
  readonly sentChoices: string[] = [];
  readonly cancelledSessions: string[] = [];
  private readonly sessions = new Map<string, MockSession>();
  private readonly eventListeners = new Set<(event: NootEvent) => void>();
  private readonly connectionListeners = new Set<(state: FunnelConnectionState) => void>();
  private script: MockFunnelScript;
  private nextSession = 1;
  private turnCount = 0;
  private activeTurnId: string | undefined;
  private cancelRequested = false;

  constructor(script: MockFunnelScript = {}) {
    this.script = script;
  }

  setScript(script: MockFunnelScript): void {
    this.script = script;
  }

  async connect(): Promise<void> {
    this.setConnection('connecting');
    this.setConnection('connected');
  }

  disconnect(): void {
    this.setConnection('disconnected');
  }

  onEvent(listener: (event: NootEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnectionChange(listener: (state: FunnelConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => this.connectionListeners.delete(listener);
  }

  async subscribeSession(sessionId: string): Promise<FunnelAck> {
    if (!this.sessions.has(sessionId)) {
      return { ok: false, error: 'unknown sessionId' };
    }
    return { ok: true };
  }

  async sendChat(sessionId: string, text: string): Promise<FunnelAck> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { ok: false, error: 'unknown sessionId' };
    }
    session.history.push({ role: 'user', text, ts: now() });
    this.sentChoices.push(text);
    this.cancelRequested = false;
    this.activeTurnId = `turn-${this.sentChoices.length}`;
    this.turnCount += 1;
    const events =
      this.script.events ??
      defaultStreamEvents(sessionId, this.activeTurnId, text, this.turnCount === 1);
    const gap = this.script.eventGapMs ?? 0;
    const assistantParts: string[] = [];
    for (const event of events) {
      if (this.cancelRequested && this.script.cancelEndsStream !== false) {
        this.emit({
          sessionId,
          turnId: this.activeTurnId,
          seq: event.seq,
          emittedAt: now(),
          type: NOOT_EVENT_TYPE_DONE,
          reason: DONE_REASON_CANCELLED,
        });
        this.activeTurnId = undefined;
        return { ok: true };
      }
      if (gap > 0) {
        await sleep(gap);
      }
      const framed = { ...event, sessionId, turnId: this.activeTurnId };
      if (framed.type === NOOT_EVENT_TYPE_TEXT_DELTA) {
        assistantParts.push(framed.text);
      }
      this.emit(framed);
    }
    const assistantText = assistantParts.join('');
    if (assistantText.trim()) {
      session.history.push({ role: 'assistant', text: assistantText, ts: now() });
    }
    this.activeTurnId = undefined;
    if (this.script.sendFailure) {
      return { ok: false, error: this.script.sendFailure };
    }
    return { ok: true };
  }

  async cancelTurn(sessionId: string): Promise<FunnelAck> {
    this.cancelledSessions.push(sessionId);
    this.cancelRequested = true;
    return { ok: true };
  }

  async listEngines(): Promise<EngineSummary[]> {
    return [...MOCK_ENGINES];
  }

  async listSessions(): Promise<SessionSummaryDto[]> {
    return [...this.sessions.values()].map(toSummary);
  }

  async createSession(engineId: string, model: string, title?: string): Promise<SessionSummaryDto> {
    const id = `00000000-0000-4000-8000-${String(this.nextSession++).padStart(12, '0')}`;
    const stamp = now();
    const session: MockSession = {
      id,
      title: title ?? 'New chat',
      createdAt: stamp,
      updatedAt: stamp,
      engineId,
      model,
      mode: DEFAULT_CONVERSATION_MODE,
      history: [],
    };
    this.sessions.set(id, session);
    return toSummary(session);
  }

  async getHistory(sessionId: string): Promise<{
    history: HistoryMessageDto[];
    engineId: string;
    model: string;
    mode: ConversationMode;
  }> {
    const session = this.requireSession(sessionId);
    return {
      history: [...session.history],
      engineId: session.engineId,
      model: session.model,
      mode: session.mode,
    };
  }

  async setEngine(sessionId: string, engineId: string, model: string): Promise<FunnelAck> {
    const session = this.requireSession(sessionId);
    session.engineId = engineId;
    session.model = model;
    session.updatedAt = now();
    return { ok: true };
  }

  async setMode(sessionId: string, mode: ConversationMode): Promise<ConversationMode> {
    const session = this.requireSession(sessionId);
    session.mode = mode;
    return mode;
  }

  async getMode(sessionId: string): Promise<ConversationMode> {
    return this.requireSession(sessionId).mode;
  }

  private requireSession(sessionId: string): MockSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }
    return session;
  }

  private emit(event: NootEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private setConnection(state: FunnelConnectionState): void {
    this.connectionState = state;
    for (const listener of this.connectionListeners) {
      listener(state);
    }
  }
}

function toSummary(session: MockSession): SessionSummaryDto {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.history.length,
    engineId: session.engineId,
    model: session.model,
    live: true,
    mode: session.mode,
  };
}

function defaultStreamEvents(
  sessionId: string,
  turnId: string,
  text: string,
  includeChoices: boolean,
): NootEvent[] {
  const stamp = now();
  const events: NootEvent[] = [
    {
      sessionId,
      turnId,
      seq: 0,
      emittedAt: stamp,
      type: NOOT_EVENT_TYPE_THINKING_DELTA,
      text: 'considering the reply',
    },
    {
      sessionId,
      turnId,
      seq: 1,
      emittedAt: stamp,
      type: NOOT_EVENT_TYPE_TEXT_DELTA,
      text: `echo: ${text}`,
    },
  ];
  if (includeChoices) {
    events.push({
      sessionId,
      turnId,
      seq: 2,
      emittedAt: stamp,
      type: NOOT_EVENT_TYPE_CHOICES,
      prompt: 'Pick one',
      options: [
        { id: 'a', label: 'Option A' },
        { id: 'b', label: 'Option B' },
      ],
    });
  }
  events.push({
    sessionId,
    turnId,
    seq: includeChoices ? 3 : 2,
    emittedAt: stamp,
    type: NOOT_EVENT_TYPE_DONE,
    reason: DONE_REASON_COMPLETED,
  });
  return events;
}

function now(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
