import type { ConversationRole, EngineCapabilities } from './conversation/engine-adapter.js';
import type { NootEvent } from './conversation/events.js';
import type { ConversationMode } from './conversation/mode.js';

export interface WsMessage<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
  sentAt: string;
}

export const WS_PING_EVENT = 'ping';
export const WS_PONG_EVENT = 'pong';

export const WS_NOOT_EVENT = 'noot_event';
export const WS_CHAT_SEND_EVENT = 'chat_send';
export const WS_SUBSCRIBE_SESSION_EVENT = 'subscribe_session';
export const WS_CANCEL_TURN_EVENT = 'cancel_turn';
export const WS_SET_ENGINE_EVENT = 'set_engine';
export const WS_LIST_ENGINES_EVENT = 'list_engines';
export const WS_CREATE_SESSION_EVENT = 'create_session';
export const WS_LIST_SESSIONS_EVENT = 'list_sessions';
export const WS_GET_HISTORY_EVENT = 'get_history';
export const WS_SET_MODE_EVENT = 'set_mode';
export const WS_GET_MODE_EVENT = 'get_mode';
export const WS_PLAN_APPROVE_EVENT = 'plan_approve';

/** Handshake field / query key for the shared BrainCore WS token. */
export const WS_AUTH_TOKEN_KEY = 'token';
export const WS_AUTH_ERROR_EVENT = 'auth_error';
export const WS_AUTH_ERROR_CODE = 'unauthorized';

export type WsPongMessage = WsMessage<typeof WS_PONG_EVENT, { echo: string }>;
export type WsNootEventMessage = WsMessage<typeof WS_NOOT_EVENT, NootEvent>;
export type WsAuthErrorPayload = { code: typeof WS_AUTH_ERROR_CODE; message: string };
export type WsAuthErrorMessage = WsMessage<typeof WS_AUTH_ERROR_EVENT, WsAuthErrorPayload>;

/** Socket.IO `auth` object (and query) shape expected by BraincoreGateway. */
export function buildWsAuth(token: string): { [WS_AUTH_TOKEN_KEY]: string } {
  return { [WS_AUTH_TOKEN_KEY]: token };
}

export interface FunnelAck {
  ok: boolean;
  error?: string;
}

export interface EngineSummary {
  id: string;
  capabilities: EngineCapabilities;
}

export interface SessionSummaryDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  engineId: string;
  model: string;
  live: boolean;
  mode: ConversationMode;
}

/** History role for background-job notes; never sent to an engine. */
export const STORED_ROLE_INTERNAL = 'internal' as const;

export type HistoryMessageRole = ConversationRole | typeof STORED_ROLE_INTERNAL;

export interface HistoryMessageDto {
  role: HistoryMessageRole;
  text: string;
  ts: string;
}

export interface ChatSendAck extends FunnelAck {
  turnId?: string;
}

export interface CreateSessionAck extends FunnelAck {
  session?: SessionSummaryDto;
}

export interface ListEnginesAck extends FunnelAck {
  engines?: EngineSummary[];
}

export interface ListSessionsAck extends FunnelAck {
  sessions?: SessionSummaryDto[];
}

export interface GetHistoryAck extends FunnelAck {
  history?: HistoryMessageDto[];
  engineId?: string;
  model?: string;
  mode?: ConversationMode;
}

export interface ModeAck extends FunnelAck {
  mode?: ConversationMode;
}

export interface SetEngineAck extends FunnelAck {
  engineId?: string;
  model?: string;
}
