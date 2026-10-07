import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    emitScanUpdate(deviceId: string, data: any): void;
    emitSessionUpdate(deviceId: string, session: any): void;
    emitPaymentUpdate(deviceId: string, payment: any): void;
}
