export interface WsMessage<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
  sentAt: string;
}

export const WS_PING_EVENT = 'ping';
export const WS_PONG_EVENT = 'pong';

export type WsPongMessage = WsMessage<typeof WS_PONG_EVENT, { echo: string }>;
