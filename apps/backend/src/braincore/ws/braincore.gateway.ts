import {
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

interface SessionSubscriptionPayload {
  sessionId?: string;
}

interface ChatSendPayload {
  sessionId?: string;
  text?: string;
}

@WebSocketGateway({ cors: { origin: true } })
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
  handleSubscribe(client: Socket, body: SessionSubscriptionPayload): { ok: boolean } {
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return { ok: false };
    }
    void client.join(sessionId);
    return { ok: true };
  }

  @SubscribeMessage(WS_CHAT_SEND_EVENT)
  async handleChatSend(body: ChatSendPayload): Promise<{ ok: boolean; error?: string }> {
    const sessionId = body.sessionId?.trim();
    const text = body.text?.trim();
    if (!sessionId || !text) {
      return { ok: false, error: 'sessionId and text are required' };
    }
    try {
      await this.braincore.sendUserMessage(sessionId, text);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'send failed' };
    }
  }
}
