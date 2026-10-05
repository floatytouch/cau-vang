import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationMessage } from '@noot/shared';
import { writeFileAtomic } from '../persistence/atomic-write.js';
import {
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_SESSION_TITLE,
  type SessionSummary,
  type StoredMessage,
  type StoredSession,
} from './session-types.js';

export interface SessionManagerOptions {
  dataDir: string;
  liveSessionCap?: number;
}

export class SessionManager {
  private readonly conversationsDir: string;
  private readonly liveSessionCap: number;
  private readonly sessions = new Map<string, StoredSession>();
  private readonly liveOrder: string[] = [];

  constructor(options: SessionManagerOptions) {
    this.conversationsDir = path.join(options.dataDir, 'conversations');
    this.liveSessionCap = options.liveSessionCap ?? DEFAULT_LIVE_SESSION_CAP;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.conversationsDir, { recursive: true });
    const entries = await fs.readdir(this.conversationsDir);
    for (const name of entries) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(this.conversationsDir, name);
      try {
        const session = await this.readSessionFile(filePath);
        this.sessions.set(session.id, session);
      } catch {
        // One corrupt file must not block the rest.
      }
    }
  }

  listSessions(): SessionSummary[] {
    const summaries: SessionSummary[] = [];
    for (const session of this.sessions.values()) {
      summaries.push(this.toSummary(session));
    }
    summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return summaries;
  }

  getSession(sessionId: string): StoredSession | undefined {
    return this.sessions.get(sessionId);
  }

  touchSession(sessionId: string): StoredSession {
    const session = this.requireSession(sessionId);
    this.markLive(sessionId);
    return session;
  }

  liveSessionIds(): readonly string[] {
    return [...this.liveOrder];
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
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    this.sessions.delete(sessionId);
    this.removeFromLive(sessionId);
    const filePath = this.sessionPath(sessionId);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
    return true;
  }

  getHistory(sessionId: string): StoredMessage[] {
    return [...this.requireSession(sessionId).messages];
  }

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
    const message: StoredMessage = {
      role,
      text,
      ts: new Date().toISOString(),
    };
    session.messages.push(message);
    session.updatedAt = message.ts;
    await this.persist(session);
    this.markLive(sessionId);
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

  private markLive(sessionId: string): void {
    this.removeFromLive(sessionId);
    this.liveOrder.push(sessionId);
    while (this.liveOrder.length > this.liveSessionCap) {
      this.liveOrder.shift();
    }
  }

  private removeFromLive(sessionId: string): void {
    const index = this.liveOrder.indexOf(sessionId);
    if (index >= 0) {
      this.liveOrder.splice(index, 1);
    }
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.conversationsDir, `${sessionId}.json`);
  }

  private async persist(session: StoredSession): Promise<void> {
    const payload = `${JSON.stringify(session, null, 2)}\n`;
    await writeFileAtomic(this.sessionPath(session.id), payload);
  }

  private async readSessionFile(filePath: string): Promise<StoredSession> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.id || !parsed.engineId || !parsed.model) {
      throw new Error(`Invalid session file ${filePath}`);
    }
    parsed.messages = parsed.messages ?? [];
    return parsed;
  }
}
