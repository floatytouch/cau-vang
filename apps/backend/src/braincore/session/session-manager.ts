import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ConversationMessage } from '@noot/shared';
import { writeFileAtomic } from '../persistence/atomic-write.js';
import {
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_SESSION_TITLE,
  SESSION_ID_PATTERN,
  type SessionSummary,
  type StoredMessage,
  type StoredSession,
} from './session-types.js';

const SESSION_FILE_SUFFIX = '.json';

export interface SessionManagerOptions {
  dataDir: string;
  liveSessionCap?: number;
}

export class SessionManager {
  private readonly logger = new Logger(SessionManager.name);
  private readonly conversationsDir: string;
  private readonly liveSessionCap: number;
  private readonly sessions = new Map<string, StoredSession>();
  private readonly liveOrder: string[] = [];
  private readonly busySessions = new Set<string>();
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(options: SessionManagerOptions) {
    this.conversationsDir = path.join(options.dataDir, 'conversations');
    this.liveSessionCap = options.liveSessionCap ?? DEFAULT_LIVE_SESSION_CAP;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.conversationsDir, { recursive: true });
    const entries = await fs.readdir(this.conversationsDir);
    for (const name of entries) {
      if (!name.endsWith(SESSION_FILE_SUFFIX)) {
        continue;
      }
      const filePath = path.join(this.conversationsDir, name);
      try {
        const session = await this.readSessionFile(filePath);
        this.sessions.set(session.id, session);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Skipping unreadable session file ${filePath}: ${reason}`);
      }
    }
  }

  listSessions(): SessionSummary[] {
    const summaries = [...this.sessions.values()].map((session) => this.toSummary(session));
    summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return summaries;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  touchSession(sessionId: string): StoredSession {
    const session = this.requireSession(sessionId);
    this.markLive(sessionId);
    return session;
  }

  liveSessionIds(): readonly string[] {
    return [...this.liveOrder];
  }

  /** Claims the session for one turn; false when a turn is already running on it. */
  beginTurn(sessionId: string): boolean {
    this.requireSession(sessionId);
    if (this.busySessions.has(sessionId)) {
      return false;
    }
    this.busySessions.add(sessionId);
    this.markLive(sessionId);
    return true;
  }

  endTurn(sessionId: string): void {
    this.busySessions.delete(sessionId);
  }

  async createSession(
    engineId: string,
    model: string,
    title = DEFAULT_SESSION_TITLE,
  ): Promise<StoredSession> {
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      engineId,
      model,
    };
    this.sessions.set(session.id, session);
    await this.persist(session);
    this.markLive(session.id);
    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
    if (this.busySessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} has a running turn; cancel it before deleting`);
    }
    this.sessions.delete(sessionId);
    this.removeFromLive(sessionId);
    await this.pendingWrites.get(sessionId);
    await fs.rm(this.sessionPath(sessionId), { force: true });
    return true;
  }

  getHistory(sessionId: string): StoredMessage[] {
    return [...this.requireSession(sessionId).messages];
  }

  /** History as engines see it; internal notes stay brain-side. */
  conversationMessages(sessionId: string): ConversationMessage[] {
    return this.getHistory(sessionId)
      .filter((message) => message.role !== 'internal')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        text: message.text,
      }));
  }

  async appendMessage(
    sessionId: string,
    role: StoredMessage['role'],
    text: string,
  ): Promise<StoredMessage> {
    const session = this.requireSession(sessionId);
    const message: StoredMessage = { role, text, ts: new Date().toISOString() };
    session.messages.push(message);
    session.updatedAt = message.ts;
    await this.persist(session);
    return message;
  }

  async setEngine(sessionId: string, engineId: string, model: string): Promise<StoredSession> {
    const session = this.requireSession(sessionId);
    session.engineId = engineId;
    session.model = model;
    session.updatedAt = new Date().toISOString();
    await this.persist(session);
    return session;
  }

  async setEngineSessionToken(sessionId: string, token: string | undefined): Promise<void> {
    const session = this.requireSession(sessionId);
    if (token) {
      session.engineSessionToken = token;
    } else {
      delete session.engineSessionToken;
    }
    session.updatedAt = new Date().toISOString();
    await this.persist(session);
  }

  private toSummary(session: StoredSession): SessionSummary {
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      engineId: session.engineId,
      model: session.model,
      live: this.liveOrder.includes(session.id),
    };
  }

  private requireSession(sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }
    return session;
  }

  /** LRU over live sessions; a busy session is never evicted, so the cap may be exceeded while all are busy. */
  private markLive(sessionId: string): void {
    this.removeFromLive(sessionId);
    this.liveOrder.push(sessionId);
    while (this.liveOrder.length > this.liveSessionCap) {
      const evictable = this.liveOrder.find(
        (candidate) => candidate !== sessionId && !this.busySessions.has(candidate),
      );
      if (!evictable) {
        this.logger.warn(`All live sessions are busy; exceeding the cap of ${this.liveSessionCap}`);
        return;
      }
      this.removeFromLive(evictable);
    }
  }

  private removeFromLive(sessionId: string): void {
    const index = this.liveOrder.indexOf(sessionId);
    if (index >= 0) {
      this.liveOrder.splice(index, 1);
    }
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.conversationsDir, `${sessionId}${SESSION_FILE_SUFFIX}`);
  }

  /** Writes of one session are chained so an older snapshot can never land after a newer one. */
  private persist(session: StoredSession): Promise<void> {
    const previous = this.pendingWrites.get(session.id) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        if (this.sessions.get(session.id) !== session) {
          return;
        }
        await writeFileAtomic(
          this.sessionPath(session.id),
          `${JSON.stringify(session, null, 2)}\n`,
        );
      });
    this.pendingWrites.set(session.id, write);
    const forget = () => {
      if (this.pendingWrites.get(session.id) === write) {
        this.pendingWrites.delete(session.id);
      }
    };
    write.then(forget, forget);
    return write;
  }

  private async readSessionFile(filePath: string): Promise<StoredSession> {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredSession;
    const expectedId = path.basename(filePath, SESSION_FILE_SUFFIX);
    if (!SESSION_ID_PATTERN.test(parsed.id ?? '') || parsed.id !== expectedId) {
      throw new Error(`session id ${String(parsed.id)} does not match its file name`);
    }
    if (!parsed.engineId || !parsed.model || !Array.isArray(parsed.messages)) {
      throw new Error('missing engineId, model or messages');
    }
    return parsed;
  }
}
