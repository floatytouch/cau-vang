import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  WS_CANCEL_TURN_EVENT,
  WS_CHAT_SEND_EVENT,
  WS_CREATE_SESSION_EVENT,
  WS_GET_HISTORY_EVENT,
  WS_GET_MODE_EVENT,
  WS_LIST_ENGINES_EVENT,
  WS_LIST_SESSIONS_EVENT,
  WS_NOOT_EVENT,
  WS_PLAN_APPROVE_EVENT,
  WS_SET_ENGINE_EVENT,
  WS_SET_MODE_EVENT,
  WS_SUBSCRIBE_SESSION_EVENT,
  type ChatSendAck,
  type CreateSessionAck,
  type FunnelAck,
  type GetHistoryAck,
  type ListEnginesAck,
  type ListSessionsAck,
  type ModeAck,
  type NootEvent,
  type SetEngineAck,
  type WsNootEventMessage,
} from '@noot/shared';
import type { Server, Socket } from 'socket.io';
import { BRAINCORE_EVENT_CHANNEL, BraincoreService } from '../braincore.service.js';
import type { WorkMode } from '../mode/work-mode.js';

export interface GatewayAck {
  ok: boolean;
  error?: string;
  mode?: WorkMode;
}

@WebSocketGateway()
export class BraincoreGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly braincore: BraincoreService) {}

  afterInit(): void {
    this.braincore.on(BRAINCORE_EVENT_CHANNEL, (event: NootEvent) => {
      const message: WsNootEventMessage = {
        type: WS_NOOT_EVENT,
        payload: event,
        sentAt: new Date().toISOString(),
      };
      this.server.to(event.sessionId).emit(WS_NOOT_EVENT, message);
    });
  }

  @SubscribeMessage(WS_SUBSCRIBE_SESSION_EVENT)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<FunnelAck> {
    const sessionId = readString(body, 'sessionId');
    if (!sessionId || !this.braincore.sessions.hasSession(sessionId)) {
      return { ok: false, error: 'unknown sessionId' };
    }
    await client.join(sessionId);
    return { ok: true };
  }

  @SubscribeMessage(WS_CHAT_SEND_EVENT)
  async handleChatSend(@MessageBody() body: unknown): Promise<ChatSendAck> {
    const sessionId = readString(body, 'sessionId');
    const text = readString(body, 'text');
    if (!sessionId || !text?.trim()) {
      return { ok: false, error: 'sessionId and text are required strings' };
    }
    const maxLength = this.braincore.maxChatTextLength;
    if (text.length > maxLength) {
      return { ok: false, error: `text exceeds ${maxLength} characters` };
    }
    try {
      const turnId = await this.braincore.sendUserMessage(sessionId, text);
      return { ok: true, turnId };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_CANCEL_TURN_EVENT)
  async handleCancelTurn(@MessageBody() body: unknown): Promise<FunnelAck> {
    const sessionId = readString(body, 'sessionId');
    if (!sessionId) {
      return { ok: false, error: 'sessionId is required' };
    }
    try {
      await this.braincore.cancelSessionTurn(sessionId, readString(body, 'turnId'));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_LIST_ENGINES_EVENT)
  handleListEngines(): ListEnginesAck {
    return { ok: true, engines: this.braincore.listEngines() };
  }

  @SubscribeMessage(WS_LIST_SESSIONS_EVENT)
  handleListSessions(): ListSessionsAck {
    return { ok: true, sessions: this.braincore.listSessions() };
  }

  @SubscribeMessage(WS_CREATE_SESSION_EVENT)
  async handleCreateSession(@MessageBody() body: unknown): Promise<CreateSessionAck> {
    const engineId = readString(body, 'engineId');
    const model = readString(body, 'model');
    const title = readString(body, 'title');
    if (!engineId || !model) {
      return { ok: false, error: 'engineId and model are required strings' };
    }
    try {
      const session = await this.braincore.createSession(engineId, model, title);
      return {
        ok: true,
        session: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
          engineId: session.engineId,
          model: session.model,
          live: true,
          mode: this.braincore.getMode(session.id),
        },
      };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_GET_HISTORY_EVENT)
  handleGetHistory(@MessageBody() body: unknown): GetHistoryAck {
    const sessionId = readString(body, 'sessionId');
    if (!sessionId) {
      return { ok: false, error: 'sessionId is required' };
    }
    try {
      const session = this.braincore.sessions.touchSession(sessionId);
      return {
        ok: true,
        history: this.braincore.getHistory(sessionId),
        engineId: session.engineId,
        model: session.model,
        mode: this.braincore.getMode(sessionId),
      };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_SET_ENGINE_EVENT)
  async handleSetEngine(@MessageBody() body: unknown): Promise<SetEngineAck> {
    const sessionId = readString(body, 'sessionId');
    const engineId = readString(body, 'engineId');
    const model = readString(body, 'model');
    if (!sessionId || !engineId || !model) {
      return { ok: false, error: 'sessionId, engineId and model are required strings' };
    }
    try {
      const session = await this.braincore.setEngine(sessionId, engineId, model);
      return { ok: true, engineId: session.engineId, model: session.model };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_SET_MODE_EVENT)
  async handleSetMode(@MessageBody() body: unknown): Promise<ModeAck> {
    const sessionId = readString(body, 'sessionId');
    const mode = readString(body, 'mode');
    if (!sessionId || !mode) {
      return { ok: false, error: 'sessionId and mode are required strings' };
    }
    try {
      const next = await this.braincore.setMode(sessionId, mode);
      return { ok: true, mode: next };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_GET_MODE_EVENT)
  handleGetMode(@MessageBody() body: unknown): ModeAck {
    const sessionId = readString(body, 'sessionId');
    if (!sessionId) {
      return { ok: false, error: 'sessionId is required' };
    }
    try {
      return { ok: true, mode: this.braincore.getMode(sessionId) };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  @SubscribeMessage(WS_PLAN_APPROVE_EVENT)
  handlePlanApprove(@MessageBody() body: unknown): GatewayAck {
    const sessionId = readString(body, 'sessionId');
    const approved = readBoolean(body, 'approved');
    if (!sessionId || approved === undefined) {
      return { ok: false, error: 'sessionId and approved (boolean) are required' };
    }
    try {
      this.braincore.queuePlanApproval(sessionId, approved);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }
}

function readString(body: unknown, field: string): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(body: unknown, field: string): boolean | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'boolean' ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
