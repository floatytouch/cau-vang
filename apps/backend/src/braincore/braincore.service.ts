import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { EngineAdapter, NootEvent } from '@noot/shared';
import {
  DEFAULT_BRAINCORE_DATA_DIR,
  DEFAULT_IDENTITY_CONFIG_DIR,
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_MAX_CHAT_TEXT_LENGTH,
} from '../config/app-config.js';
import { EngineRegistry } from './engine/engine-registry.js';
import { IdentityBuilder } from './identity/identity-builder.js';
import { SessionManager } from './session/session-manager.js';
import {
  createMockBareApiAdapter,
  createMockHarnessAdapter,
} from './testing/mock-engine-adapter.js';
import { registerSampleTools, ToolRegistry } from './tools/tool-registry.js';
import { runConversationTurn } from './turn/turn-runner.js';

export const BRAINCORE_EVENT_CHANNEL = 'noot_event';

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
  readonly maxChatTextLength: number;
  private readonly identityConfigDir: string;
  private identity: IdentityBuilder | undefined;
  private systemPrompt: string | undefined;
  private readonly activeTurns = new Map<string, EngineAdapter>();

  constructor(@Optional() @Inject(BRAINCORE_OPTIONS) options: BraincoreServiceOptions | null) {
    super();
    const resolved = options ?? {};
    this.sessions = new SessionManager({
      dataDir: resolved.dataDir ?? DEFAULT_BRAINCORE_DATA_DIR,
      liveSessionCap: resolved.liveSessionCap ?? DEFAULT_LIVE_SESSION_CAP,
    });
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

  listSessions() {
    return this.sessions.listSessions();
  }

  async createSession(engineId: string, model: string, title?: string) {
    this.engines.get(engineId);
    return this.sessions.createSession(engineId, model, title);
  }

  async deleteSession(sessionId: string) {
    return this.sessions.deleteSession(sessionId);
  }

  getHistory(sessionId: string) {
    return this.sessions.getHistory(sessionId);
  }

  async setEngine(sessionId: string, engineId: string, model: string) {
    this.engines.get(engineId);
    return this.sessions.setEngine(sessionId, engineId, model);
  }

  /** A background job's result: stored as `internal`, emitted as its own note turn. */
  async postInternalTurn(sessionId: string, source: string, text: string): Promise<void> {
    await this.sessions.appendMessage(sessionId, 'internal', text);
    const meta = { sessionId, turnId: randomUUID(), emittedAt: new Date().toISOString() };
    this.emitEvent({ ...meta, seq: 0, type: 'internal_note', source, text });
    this.emitEvent({ ...meta, seq: 1, type: 'done', reason: 'completed' });
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
      await this.sessions.appendMessage(sessionId, 'user', text);
      const turnId = randomUUID();
      this.activeTurns.set(turnId, adapter);
      try {
        const assistantText = await this.streamTurn({
          adapter,
          session: { sessionId, history },
          input: { text },
          options: {
            turnId,
            model: session.model,
            systemPrompt,
            tools:
              adapter.capabilities.toolLoop === 'ownToolLoop'
                ? this.tools.createBridge()
                : undefined,
          },
          toolRegistry: this.tools,
        });
        if (assistantText.trim()) {
          await this.sessions.appendMessage(sessionId, 'assistant', assistantText);
        }
      } finally {
        this.activeTurns.delete(turnId);
      }
      return turnId;
    } finally {
      this.sessions.endTurn(sessionId);
    }
  }

  async cancelTurn(turnId: string): Promise<void> {
    await this.activeTurns.get(turnId)?.cancel(turnId);
  }

  private async streamTurn(params: Parameters<typeof runConversationTurn>[0]): Promise<string> {
    const textParts: string[] = [];
    for await (const event of runConversationTurn(params)) {
      this.emitEvent(event);
      if (event.type === 'text_delta') {
        textParts.push(event.text);
      }
    }
    return textParts.join('');
  }

  private emitEvent(event: NootEvent): void {
    this.emit(BRAINCORE_EVENT_CHANNEL, event);
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
