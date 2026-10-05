import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { WS_PING_EVENT, WS_PONG_EVENT, type WsPongMessage } from '@noot/shared';

@WebSocketGateway()
export class RealtimeGateway {
  @SubscribeMessage(WS_PING_EVENT)
  handlePing(@MessageBody() echo: unknown): WsPongMessage {
    return {
      type: WS_PONG_EVENT,
      payload: { echo: typeof echo === 'string' ? echo : '' },
      sentAt: new Date().toISOString(),
    };
  }
}
