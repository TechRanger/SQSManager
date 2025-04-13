import { Logger } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true, // 改为允许所有来源，并支持凭证
    credentials: true
  },
  namespace: '/realtime', // Use a namespace for separation
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('RealtimeGateway');

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Optional: Leave rooms automatically on disconnect
  }

  // --- Room Management ---

  @SubscribeMessage('joinDeploymentRoom')
  handleJoinDeploymentRoom(client: Socket, room: string): void {
    this.logger.log(`Client ${client.id} joining deployment room: ${room}`);
    client.join(room); // room format: deploy-{some_identifier}
  }

  @SubscribeMessage('leaveDeploymentRoom')
  handleLeaveDeploymentRoom(client: Socket, room: string): void {
    this.logger.log(`Client ${client.id} leaving deployment room: ${room}`);
    client.leave(room);
  }

  @SubscribeMessage('joinUpdateRoom')
  handleJoinUpdateRoom(client: Socket, room: string): void {
    this.logger.log(`Client ${client.id} joining update room: ${room}`);
    client.join(room); // room format: update-{serverId}
  }

  @SubscribeMessage('leaveUpdateRoom')
  handleLeaveUpdateRoom(client: Socket, room: string): void {
    this.logger.log(`Client ${client.id} leaving update room: ${room}`);
    client.leave(room);
  }

  // --- Log/Status Emission --- 
  // These are called from services, not subscribed messages from client

  // Deployment related
  sendDeploymentLog(room: string, line: string): void {
    this.server.to(room).emit('deploymentLog', line);
  }

  sendDeploymentComplete(room: string, message: string): void {
    this.server.to(room).emit('deploymentComplete', message);
  }

  sendDeploymentError(room: string, error: string): void {
    this.server.to(room).emit('deploymentError', error);
  }

  // Update related
  sendUpdateLog(room: string, line: string): void {
    this.server.to(room).emit('updateLog', line);
  }

  sendUpdateComplete(room: string, message: string): void {
    this.server.to(room).emit('updateComplete', message);
  }

  sendUpdateError(room: string, error: string): void {
    this.server.to(room).emit('updateError', error);
  }
} 