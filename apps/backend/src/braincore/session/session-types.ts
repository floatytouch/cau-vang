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

export const MOCK_USE_ECHO_TOOL_MARKER = 'USE_ECHO_TOOL';

export const TOOL_RESULTS_INPUT_PREFIX = '__tool_results__:';
