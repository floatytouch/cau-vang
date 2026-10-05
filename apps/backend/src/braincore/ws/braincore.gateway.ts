import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  WS_CHAT_SEND_EVENT,
  WS_NOOT_EVENT,
  WS_PLAN_APPROVE_EVENT,
  WS_SET_MODE_EVENT,
  WS_SUBSCRIBE_SESSION_EVENT,
  type NootEvent,
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
  ): Promise<GatewayAck> {
    const sessionId = readString(body, 'sessionId');
    if (!sessionId || !this.braincore.sessions.hasSession(sessionId)) {
      return { ok: false, error: 'unknown sessionId' };
    }
    await client.join(sessionId);
    return { ok: true };
  }

  @SubscribeMessage(WS_CHAT_SEND_EVENT)
  async handleChatSend(@MessageBody() body: unknown): Promise<GatewayAck> {
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
      await this.braincore.sendUserMessage(sessionId, text);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  @SubscribeMessage(WS_SET_MODE_EVENT)
  async handleSetMode(@MessageBody() body: unknown): Promise<GatewayAck> {
    const sessionId = readString(body, 'sessionId');
    const mode = readString(body, 'mode');
    if (!sessionId || !mode) {
      return { ok: false, error: 'sessionId and mode are required strings' };
    }
    try {
      const next = await this.braincore.setMode(sessionId, mode);
      return { ok: true, mode: next };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
