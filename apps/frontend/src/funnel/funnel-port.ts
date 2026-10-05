import type {
  ConversationMode,
  EngineSummary,
  FunnelAck,
  HistoryMessageDto,
  NootEvent,
  SessionSummaryDto,
} from '@noot/shared';

export type FunnelConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface FunnelPort {
  readonly connectionState: FunnelConnectionState;
  connect(): Promise<void>;
  disconnect(): void;
  onEvent(listener: (event: NootEvent) => void): () => void;
  onConnectionChange(listener: (state: FunnelConnectionState) => void): () => void;
  subscribeSession(sessionId: string): Promise<FunnelAck>;
  sendChat(sessionId: string, text: string): Promise<FunnelAck>;
  cancelTurn(sessionId: string, turnId?: string): Promise<FunnelAck>;
  listEngines(): Promise<EngineSummary[]>;
  listSessions(): Promise<SessionSummaryDto[]>;
  createSession(engineId: string, model: string, title?: string): Promise<SessionSummaryDto>;
  getHistory(sessionId: string): Promise<{
    history: HistoryMessageDto[];
    engineId: string;
    model: string;
    mode: ConversationMode;
  }>;
  setEngine(sessionId: string, engineId: string, model: string): Promise<FunnelAck>;
  setMode(sessionId: string, mode: ConversationMode): Promise<ConversationMode>;
  getMode(sessionId: string): Promise<ConversationMode>;
}
