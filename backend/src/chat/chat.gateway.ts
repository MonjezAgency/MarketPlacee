import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  // Map userId → socketId
  private readonly userSockets = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      const userId = payload.sub;
      client.data.userId = userId;
      client.data.role = payload.role;

      // Join personal room (userId as room name)
      client.join(userId);
      this.userSockets.set(userId, client.id);

      // Support/Admin join shared support room
      const supportRoles = ['ADMIN', 'SUPPORT', 'DEVELOPER', 'LOGISTICS'];
      if (supportRoles.includes(payload.role)) {
        client.join('support-room');
      }

      this.logger.log(`User ${userId} (${payload.role}) connected via WebSocket`);
    } catch (_e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { content?: string; imageUrl?: string; receiverId?: string },
  ) {
    const senderId = client.data.userId;
    if (!senderId) return;

    const result = await this.chatService.sendMessage(senderId, data);

    if (data.receiverId) {
      // Support replying to a specific user
      this.server.to(data.receiverId).emit('new_message', result);
      // Also emit back to sender (support agent) so their UI updates
      this.server.to(senderId).emit('new_message', result);
      // Notify all support staff that this conversation has a new message
      this.server.to('support-room').emit('conversation_updated', {
        userId: data.receiverId,
        message: result,
      });
    } else {
      // User sending to support — result contains userMessage + botMessage
      const { userMessage, botMessage } = result as any;
      // Send user's own message back (echo so it appears in their chat)
      this.server.to(senderId).emit('new_message', userMessage || result);
      // Send bot reply back to user
      if (botMessage) {
        this.server.to(senderId).emit('new_message', botMessage);
      }
      // Notify support room: new inquiry arrived + refresh conversations list
      this.server.to('support-room').emit('new_inquiry', {
        userId: senderId,
        message: userMessage || result,
        botReply: botMessage,
      });
      this.server.to('support-room').emit('conversation_updated', {
        userId: senderId,
        message: userMessage || result,
      });
    }

    return result;
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ids: string[] },
  ) {
    await this.chatService.markAsRead(data.ids);
  }

  // Called by ChatService to push messages from HTTP endpoint too
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(userId).emit(event, data);
  }

  emitToSupport(event: string, data: any) {
    this.server.to('support-room').emit(event, data);
  }
}
