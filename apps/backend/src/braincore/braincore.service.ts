import {
  CONVERSATION_ROLE_ASSISTANT,
  CONVERSATION_ROLE_USER,
  DONE_REASON_COMPLETED,
  ENGINE_TOOL_LOOP_OWN,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_INTERNAL_NOTE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_USAGE,
  WS_NOOT_EVENT,
} from '@noot/shared';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { EngineAdapter, EngineSummary, NootEvent, SessionSummaryDto } from '@noot/shared';
import {
  DEFAULT_BRAINCORE_DATA_DIR,
  DEFAULT_IDENTITY_CONFIG_DIR,
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_MAX_CHAT_TEXT_LENGTH,
} from '../config/app-config.js';
import { EngineRegistry } from './engine/engine-registry.js';
import { IdentityBuilder } from './identity/identity-builder.js';
import { PendingApprovalStore } from './mode/pending-approval-store.js';
import { planNoteFor } from './mode/plan-note.js';
import { resolveTurnGate } from './mode/resolve-turn-gate.js';
import {
  invalidWorkModeMessage,
  isWorkMode,
  WORK_MODE_PLAN,
  type WorkMode,
} from './mode/work-mode.js';
import { SessionManager } from './session/session-manager.js';
import {
  STORED_ROLE_INTERNAL,
  type StoredMessage,
  type StoredSession,
} from './session/session-types.js';
import {
  createMockBareApiAdapter,
  createMockHarnessAdapter,
} from './testing/mock-engine-adapter.js';
import { registerSampleTools, ToolRegistry } from './tools/tool-registry.js';
import { runConversationTurn } from './turn/turn-runner.js';
import { TurnUsageAccumulator, UsageRecorder } from './usage/usage-recorder.js';

export const BRAINCORE_OPTIONS = Symbol('BRAINCORE_OPTIONS');

export interface BraincoreServiceOptions {
  dataDir?: string;
  identityConfigDir?: string;
  liveSessionCap?: number;
  maxChatTextLength?: number;
  registerMocks?: boolean;
}

@Injectable()
export class BraincoreService extends EventEmitter {
  readonly sessions: SessionManager;
  readonly engines = new EngineRegistry();
  readonly tools = new ToolRegistry();
  readonly usage: UsageRecorder;
  readonly maxChatTextLength: number;
  private readonly identityConfigDir: string;
  private readonly pendingApprovals = new PendingApprovalStore();
  private identity: IdentityBuilder | undefined;
  private systemPrompt: string | undefined;
  private readonly activeTurns = new Map<string, EngineAdapter>();
  private readonly activeTurnBySession = new Map<string, string>();

  constructor(@Optional() @Inject(BRAINCORE_OPTIONS) options: BraincoreServiceOptions | null) {
    super();
    const resolved = options ?? {};
    const dataDir = resolved.dataDir ?? DEFAULT_BRAINCORE_DATA_DIR;
    this.sessions = new SessionManager({
      dataDir,
      liveSessionCap: resolved.liveSessionCap ?? DEFAULT_LIVE_SESSION_CAP,
    });
    this.usage = new UsageRecorder({ dataDir });
    this.identityConfigDir = resolved.identityConfigDir ?? DEFAULT_IDENTITY_CONFIG_DIR;
    this.maxChatTextLength = resolved.maxChatTextLength ?? DEFAULT_MAX_CHAT_TEXT_LENGTH;
    registerSampleTools(this.tools);
    if (resolved.registerMocks ?? false) {
      this.engines.register(createMockBareApiAdapter());
      this.engines.register(createMockHarnessAdapter());
    }
  }

  async initialize(): Promise<void> {
    this.identity = await IdentityBuilder.load(this.identityConfigDir);
    this.systemPrompt = await this.identity.buildSystemPrompt();
    await this.sessions.initialize();
  }

  getBotName(): string {
    return this.requireIdentity().getBotName();
  }

  async setBotName(botName: string): Promise<string> {
    const identity = this.requireIdentity();
    await identity.setBotName(botName);
    this.systemPrompt = await identity.buildSystemPrompt();
    return identity.getBotName();
  }

  listSessions(): SessionSummaryDto[] {
    return this.sessions.listSessions().map((session) => ({
      ...session,
      mode: this.getMode(session.id),
    }));
  }

  listEngines(): EngineSummary[] {
    return this.engines.listIds().map((id) => {
      const adapter = this.engines.get(id);
      return { id: adapter.id, capabilities: adapter.capabilities };
    });
  }

  async createSession(engineId: string, model: string, title?: string): Promise<StoredSession> {
    this.engines.get(engineId);
    return this.sessions.createSession(engineId, model, title);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.pendingApprovals.clear(sessionId);
    const deleted = await this.sessions.deleteSession(sessionId);
    if (deleted) {
      this.activeTurnBySession.delete(sessionId);
    }
    return deleted;
  }

  getHistory(sessionId: string): StoredMessage[] {
    return this.sessions.getHistory(sessionId);
  }

  getMode(sessionId: string): WorkMode {
    return this.sessions.getMode(sessionId);
  }

  async setMode(sessionId: string, mode: string): Promise<WorkMode> {
    if (!isWorkMode(mode)) {
      throw new Error(invalidWorkModeMessage(mode));
    }
    // Any mode change drops a pending tap so it cannot unlock a later, unrelated plan turn.
    this.pendingApprovals.clear(sessionId);
    const session = await this.sessions.setMode(sessionId, mode);
    return session.mode;
  }

  /** Queues a one-shot Approve/Reject for the next user turn on this session. */
  queuePlanApproval(sessionId: string, approved: boolean): void {
    const session = this.sessions.touchSession(sessionId);
    if (session.mode !== WORK_MODE_PLAN) {
      throw new Error(
        `Session ${sessionId} is in ${session.mode} mode; plan_approve needs plan mode`,
      );
    }
    this.pendingApprovals.queue(sessionId, approved);
  }

  async setEngine(sessionId: string, engineId: string, model: string): Promise<StoredSession> {
    this.engines.get(engineId);
    return this.sessions.setEngine(sessionId, engineId, model);
  }

  /** A background job's result: stored as `internal`, emitted as its own note turn. */
  async postInternalTurn(sessionId: string, source: string, text: string): Promise<void> {
    await this.sessions.appendMessage(sessionId, STORED_ROLE_INTERNAL, text);
    const meta = { sessionId, turnId: randomUUID(), emittedAt: new Date().toISOString() };
    this.emitEvent({ ...meta, seq: 0, type: NOOT_EVENT_TYPE_INTERNAL_NOTE, source, text });
    this.emitEvent({ ...meta, seq: 1, type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_COMPLETED });
  }

  async sendUserMessage(sessionId: string, text: string): Promise<string> {
    const systemPrompt = this.requireSystemPrompt();
    const session = this.sessions.touchSession(sessionId);
    const adapter = this.engines.get(session.engineId);
    if (!this.sessions.beginTurn(sessionId)) {
      throw new Error(`Session ${sessionId} already has a running turn`);
    }
    try {
      const history = this.sessions.conversationMessages(sessionId);
      await this.sessions.appendMessage(sessionId, CONVERSATION_ROLE_USER, text);
      const gate = resolveTurnGate({
        currentMode: () => this.sessions.getMode(sessionId),
        userText: text,
        sessionId,
        approvals: this.pendingApprovals,
      });
      const engineText = `${planNoteFor(session.mode)}${text}`;
      const turnId = randomUUID();
      this.activeTurns.set(turnId, adapter);
      this.activeTurnBySession.set(sessionId, turnId);
      try {
        const assistantText = await this.streamTurn({
          adapter,
          session: { sessionId, history },
          input: { text: engineText },
          options: {
            turnId,
            model: session.model,
            systemPrompt,
            tools:
              adapter.capabilities.toolLoop === ENGINE_TOOL_LOOP_OWN
                ? this.tools.createBridge(gate.policy)
                : undefined,
          },
          toolRegistry: this.tools,
          toolAccessPolicy: gate.policy,
        });
        if (assistantText.trim()) {
          await this.sessions.appendMessage(sessionId, CONVERSATION_ROLE_ASSISTANT, assistantText);
        }
      } finally {
        this.activeTurns.delete(turnId);
        if (this.activeTurnBySession.get(sessionId) === turnId) {
          this.activeTurnBySession.delete(sessionId);
        }
      }
      return turnId;
    } finally {
      this.sessions.endTurn(sessionId);
    }
  }

  async cancelTurn(turnId: string): Promise<void> {
    await this.activeTurns.get(turnId)?.cancel(turnId);
  }

  /** Cancels the session's running turn; a turnId from another session or an older turn is refused. */
  async cancelSessionTurn(sessionId: string, turnId?: string): Promise<void> {
    if (!this.sessions.hasSession(sessionId)) {
      throw new Error(`Unknown session ${sessionId}`);
    }
    const activeTurnId = this.activeTurnBySession.get(sessionId);
    if (!activeTurnId) {
      return;
    }
    if (turnId !== undefined && turnId !== activeTurnId) {
      throw new Error(`Turn ${turnId} is not the running turn of session ${sessionId}`);
    }
    await this.cancelTurn(activeTurnId);
  }

  private async streamTurn(params: Parameters<typeof runConversationTurn>[0]): Promise<string> {
    const textParts: string[] = [];
    const startedAt = Date.now();
    const accumulator = new TurnUsageAccumulator({
      sessionId: params.session.sessionId,
      turnId: params.options.turnId,
      engine: params.adapter.id,
      model: params.options.model,
    });
    for await (const event of runConversationTurn(params)) {
      this.emitEvent(event);
      if (event.type === NOOT_EVENT_TYPE_USAGE) {
        accumulator.observe(event);
      }
      if (event.type === NOOT_EVENT_TYPE_TEXT_DELTA) {
        textParts.push(event.text);
      }
      if (event.type === NOOT_EVENT_TYPE_DONE) {
        await this.usage.recordTurn(accumulator.finalize(Date.now() - startedAt));
      }
    }
    return textParts.join('');
  }

  private emitEvent(event: NootEvent): void {
    this.emit(WS_NOOT_EVENT, event);
  }

  private requireSystemPrompt(): string {
    if (this.systemPrompt === undefined) {
      throw new Error('BraincoreService.initialize() must finish before turns run');
    }
    return this.systemPrompt;
  }

  private requireIdentity(): IdentityBuilder {
    if (this.identity === undefined) {
      throw new Error('BraincoreService.initialize() must finish before identity access');
    }
    return this.identity;
  }
}
