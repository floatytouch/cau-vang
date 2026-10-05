export type StoredMessageRole = 'user' | 'assistant' | 'internal';

export interface StoredMessage {
  role: StoredMessageRole;
  text: string;
  ts: string;
}

export interface StoredSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  engineId: string;
  model: string;
  engineSessionToken?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  engineId: string;
  model: string;
  live: boolean;
}

export const DEFAULT_SESSION_TITLE = 'New chat';

export const DEFAULT_LIVE_SESSION_CAP = 3;

/** Session ids are server-allocated UUIDs; anything else never reaches a file path. */
export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
