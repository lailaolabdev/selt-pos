import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  emitScanUpdate(deviceId: string, data: any) {
    this.server.emit('scanUpdate', { deviceId, ...data });
  }

  emitSessionUpdate(deviceId: string, session: any) {
    this.server.emit('sessionUpdate', { deviceId, ...session });
  }

  emitPaymentUpdate(deviceId: string, payment: any) {
    this.server.emit('paymentUpdate', { deviceId, ...payment });
  }
}
