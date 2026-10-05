import type { ConversationRole } from '@noot/shared';
import type { WorkMode } from '../mode/work-mode.js';

export const STORED_ROLE_INTERNAL = 'internal' as const;

export type StoredMessageRole = ConversationRole | typeof STORED_ROLE_INTERNAL;

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
  /** Per-conversation Plan/Auto working mode; survives restart. */
  mode: WorkMode;
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
  mode: WorkMode;
  live: boolean;
}

export const DEFAULT_SESSION_TITLE = 'New chat';

/** Session ids are server-allocated UUIDs; anything else never reaches a file path. */
export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
