import type { EngineCapabilities } from './conversation/engine-adapter.js';
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

/** Socket.IO handshake `auth.token` field expected by the NV-10 WS auth gate. */
export const WS_AUTH_TOKEN_FIELD = 'token';

export type WsPongMessage = WsMessage<typeof WS_PONG_EVENT, { echo: string }>;
export type WsNootEventMessage = WsMessage<typeof WS_NOOT_EVENT, NootEvent>;

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

export interface HistoryMessageDto {
  role: 'user' | 'assistant' | 'internal';
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
