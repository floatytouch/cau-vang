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
  WS_SUBSCRIBE_SESSION_EVENT,
  type NootEvent,
  type WsNootEventMessage,
} from '@noot/shared';
import type { Server, Socket } from 'socket.io';
import { BRAINCORE_EVENT_CHANNEL, BraincoreService } from '../braincore.service.js';

export const MAX_CHAT_TEXT_LENGTH = 100_000;

export interface GatewayAck {
  ok: boolean;
  error?: string;
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
    if (text.length > MAX_CHAT_TEXT_LENGTH) {
      return { ok: false, error: `text exceeds ${MAX_CHAT_TEXT_LENGTH} characters` };
    }
    try {
      await this.braincore.sendUserMessage(sessionId, text);
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
