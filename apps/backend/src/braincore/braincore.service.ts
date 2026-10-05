import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { NootEvent } from '@noot/shared';
import { resolveBraincoreDataDir, resolveIdentityConfigDir } from './braincore-paths.js';
import { EngineRegistry } from './engine/engine-registry.js';
import { IdentityBuilder } from './identity/identity-builder.js';
import { SessionManager } from './session/session-manager.js';
import {
  createMockBareApiAdapter,
  createMockHarnessAdapter,
  MOCK_ENGINE_ID,
} from './testing/mock-engine-adapter.js';
import { registerSampleTools, ToolRegistry } from './tools/tool-registry.js';
import { runConversationTurn } from './turn/turn-runner.js';

export const BRAINCORE_EVENT_CHANNEL = 'noot_event';

export interface BraincoreServiceOptions {
  dataDir?: string;
  identityConfigDir?: string;
  registerMocks?: boolean;
}

@Injectable()
export class BraincoreService extends EventEmitter {
  readonly sessions: SessionManager;
  readonly engines: EngineRegistry;
  readonly tools: ToolRegistry;
  private systemPromptPromise: Promise<string> | undefined;
  private readonly activeTurns = new Map<string, AbortController>();

  constructor(options: BraincoreServiceOptions = {}) {
    super();
    const dataDir = options.dataDir ?? resolveBraincoreDataDir();
    const identityConfigDir = options.identityConfigDir ?? resolveIdentityConfigDir();
    this.sessions = new SessionManager({ dataDir });
    this.engines = new EngineRegistry();
    this.tools = new ToolRegistry();
    registerSampleTools(this.tools);
    this.systemPromptPromise = IdentityBuilder.load(identityConfigDir).then((builder) =>
      builder.buildSystemPrompt(),
    );
    if (options.registerMocks !== false) {
      this.engines.register(createMockBareApiAdapter());
      this.engines.register(createMockHarnessAdapter());
    }
  }

  async initialize(): Promise<void> {
    await this.sessions.initialize();
  }

  async listSessions() {
    return this.sessions.listSessions();
  }

  async createSession(engineId: string, model: string, title?: string) {
    return this.sessions.createSession(engineId, model, title);
  }

  async deleteSession(sessionId: string) {
    return this.sessions.deleteSession(sessionId);
  }

  getHistory(sessionId: string) {
    return this.sessions.getHistory(sessionId);
  }

  async setEngine(sessionId: string, engineId: string, model: string) {
    if (!this.engines.has(engineId)) {
      throw new Error(`Unknown engine ${engineId}`);
    }
    return this.sessions.setEngine(sessionId, engineId, model);
  }

  async postInternalTurn(sessionId: string, source: string, text: string): Promise<void> {
    await this.sessions.appendMessage(sessionId, 'internal', text);
    const turnId = randomUUID();
    const note: NootEvent = {
      type: 'internal_note',
      sessionId,
      turnId,
      seq: 0,
      emittedAt: new Date().toISOString(),
      source,
      text,
    };
    this.emitEvent(note);
  }

  async sendUserMessage(sessionId: string, text: string): Promise<string> {
    const session = this.sessions.touchSession(sessionId);
    const adapter = this.engines.get(session.engineId);
    await this.sessions.appendMessage(sessionId, 'user', text);

    const turnId = randomUUID();
    const systemPrompt = await this.requireSystemPrompt();
    const engineSession = {
      sessionId,
      history: this.sessions.conversationMessages(sessionId),
    };

    const options = {
      turnId,
      model: session.model,
      systemPrompt,
      tools:
        adapter.capabilities.toolLoop === 'ownToolLoop' ? this.tools.createBridge() : undefined,
    };

    const assistantParts: string[] = [];
    const stream = runConversationTurn({
      adapter,
      session: engineSession,
      input: { text },
      options,
      toolRegistry: this.tools,
    });

    for await (const event of stream) {
      this.emitEvent(event);
      if (event.type === 'text_delta') {
        assistantParts.push(event.text);
      }
    }

    const assistantText = assistantParts.join('').trim();
    if (assistantText) {
      await this.sessions.appendMessage(sessionId, 'assistant', assistantText);
    }
    return turnId;
  }

  async cancelTurn(turnId: string): Promise<void> {
    const controller = this.activeTurns.get(turnId);
    controller?.abort();
    for (const engineId of this.engines.listIds()) {
      await this.engines.get(engineId).cancel(turnId);
    }
  }

  private emitEvent(event: NootEvent): void {
    this.emit(BRAINCORE_EVENT_CHANNEL, event);
  }

  private async requireSystemPrompt(): Promise<string> {
    if (!this.systemPromptPromise) {
      throw new Error('Identity builder was not configured');
    }
    return this.systemPromptPromise;
  }
}

export { MOCK_ENGINE_ID };
