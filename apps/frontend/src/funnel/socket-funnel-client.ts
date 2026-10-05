import {
  DEFAULT_CONVERSATION_MODE,
  WS_AUTH_TOKEN_FIELD,
  WS_CANCEL_TURN_EVENT,
  WS_CHAT_SEND_EVENT,
  WS_CREATE_SESSION_EVENT,
  WS_GET_HISTORY_EVENT,
  WS_GET_MODE_EVENT,
  WS_LIST_ENGINES_EVENT,
  WS_LIST_SESSIONS_EVENT,
  WS_NOOT_EVENT,
  WS_SET_ENGINE_EVENT,
  WS_SET_MODE_EVENT,
  WS_SUBSCRIBE_SESSION_EVENT,
  type ChatSendAck,
  type ConversationMode,
  type CreateSessionAck,
  type EngineSummary,
  type FunnelAck,
  type GetHistoryAck,
  type ListEnginesAck,
  type ListSessionsAck,
  type ModeAck,
  type NootEvent,
  type SessionSummaryDto,
  type SetEngineAck,
  type WsNootEventMessage,
} from '@noot/shared';
import { io, type Socket } from 'socket.io-client';
import type { FrontendConfig } from '../config/frontend-config.js';
import type { FunnelConnectionState, FunnelPort } from './funnel-port.js';

export class SocketFunnelClient implements FunnelPort {
  connectionState: FunnelConnectionState = 'disconnected';
  private socket: Socket | undefined;
  private readonly eventListeners = new Set<(event: NootEvent) => void>();
  private readonly connectionListeners = new Set<(state: FunnelConnectionState) => void>();

  constructor(private readonly config: FrontendConfig) {}

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }
    this.setConnection('connecting');
    const socket = io(this.config.wsUrl || undefined, {
      auth: { [WS_AUTH_TOKEN_FIELD]: this.config.wsToken },
      transports: ['websocket'],
      autoConnect: false,
    });
    this.socket = socket;
    socket.on(WS_NOOT_EVENT, (message: WsNootEventMessage) => {
      for (const listener of this.eventListeners) {
        listener(message.payload);
      }
    });
    socket.on('connect', () => this.setConnection('connected'));
    socket.on('disconnect', () => this.setConnection('disconnected'));
    socket.on('connect_error', () => this.setConnection('error'));

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        this.setConnection('error');
        reject(error);
      };
      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };
      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
      socket.connect();
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
    this.setConnection('disconnected');
  }

  onEvent(listener: (event: NootEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnectionChange(listener: (state: FunnelConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => this.connectionListeners.delete(listener);
  }

  subscribeSession(sessionId: string): Promise<FunnelAck> {
    return this.emitAck(WS_SUBSCRIBE_SESSION_EVENT, { sessionId });
  }

  sendChat(sessionId: string, text: string): Promise<FunnelAck> {
    return this.emitAck<ChatSendAck>(WS_CHAT_SEND_EVENT, { sessionId, text });
  }

  cancelTurn(sessionId: string, turnId?: string): Promise<FunnelAck> {
    return this.emitAck(WS_CANCEL_TURN_EVENT, { sessionId, turnId });
  }

  async listEngines(): Promise<EngineSummary[]> {
    const ack = await this.emitAck<ListEnginesAck>(WS_LIST_ENGINES_EVENT, {});
    if (!ack.ok || !ack.engines) {
      throw new Error(ack.error ?? 'list_engines failed');
    }
    return ack.engines;
  }

  async listSessions(): Promise<SessionSummaryDto[]> {
    const ack = await this.emitAck<ListSessionsAck>(WS_LIST_SESSIONS_EVENT, {});
    if (!ack.ok || !ack.sessions) {
      throw new Error(ack.error ?? 'list_sessions failed');
    }
    return ack.sessions;
  }

  async createSession(engineId: string, model: string, title?: string): Promise<SessionSummaryDto> {
    const ack = await this.emitAck<CreateSessionAck>(WS_CREATE_SESSION_EVENT, {
      engineId,
      model,
      title,
    });
    if (!ack.ok || !ack.session) {
      throw new Error(ack.error ?? 'create_session failed');
    }
    return ack.session;
  }

  async getHistory(sessionId: string) {
    const ack = await this.emitAck<GetHistoryAck>(WS_GET_HISTORY_EVENT, { sessionId });
    if (!ack.ok || !ack.history || !ack.engineId || !ack.model) {
      throw new Error(ack.error ?? 'get_history failed');
    }
    return {
      history: ack.history,
      engineId: ack.engineId,
      model: ack.model,
      mode: ack.mode ?? DEFAULT_CONVERSATION_MODE,
    };
  }

  async setEngine(sessionId: string, engineId: string, model: string): Promise<FunnelAck> {
    return this.emitAck<SetEngineAck>(WS_SET_ENGINE_EVENT, { sessionId, engineId, model });
  }

  async setMode(sessionId: string, mode: ConversationMode): Promise<ConversationMode> {
    const ack = await this.emitAck<ModeAck>(WS_SET_MODE_EVENT, { sessionId, mode });
    if (!ack.ok || !ack.mode) {
      throw new Error(ack.error ?? 'set_mode failed');
    }
    return ack.mode;
  }

  async getMode(sessionId: string): Promise<ConversationMode> {
    const ack = await this.emitAck<ModeAck>(WS_GET_MODE_EVENT, { sessionId });
    if (!ack.ok || !ack.mode) {
      throw new Error(ack.error ?? 'get_mode failed');
    }
    return ack.mode;
  }

  private emitAck<T extends FunnelAck>(event: string, payload: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: 'funnel is not connected' } as T);
    }
    return new Promise((resolve) => {
      socket.timeout(15_000).emit(event, payload, (error: Error | null, ack: T) => {
        if (error) {
          resolve({ ok: false, error: error.message } as T);
          return;
        }
        resolve(ack);
      });
    });
  }

  private setConnection(state: FunnelConnectionState): void {
    this.connectionState = state;
    for (const listener of this.connectionListeners) {
      listener(state);
    }
  }
}
