import type { NootEvent } from './conversation/events.js';

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

export type WsPongMessage = WsMessage<typeof WS_PONG_EVENT, { echo: string }>;
export type WsNootEventMessage = WsMessage<typeof WS_NOOT_EVENT, NootEvent>;
