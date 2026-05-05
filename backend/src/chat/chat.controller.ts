import { Controller, Get, Post, Body, UseGuards, Request, Param, Patch } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  async sendMessage(@Request() req, @Body() data: { content?: string; imageUrl?: string; receiverId?: string }) {
    return this.chatService.sendMessage(req.user.sub, data);
  }

  @Get('messages')
  async getMyMessages(@Request() req) {
    return this.chatService.getMessagesForUser(req.user.sub);
  }

  @Get('admin/conversations')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
  async getConversations(@Request() req) {
    return this.chatService.getConversationsWithStatus(req.user.role?.toUpperCase());
  }

  @Patch('admin/switch/:userId')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
  async switchToHuman(@Param('userId') userId: string, @Request() req) {
    return this.chatService.switchToHuman(userId, req.user.sub);
  }

  @Patch('admin/switch-ai/:userId')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
  async switchToAI(@Param('userId') userId: string, @Request() req) {
    return this.chatService.switchToAI(userId, req.user.sub);
  }

  @Get('admin/messages/:userId')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS)
  async getUserMessages(@Param('userId') userId: string) {
    return this.chatService.getMessagesForUser(userId);
  }

  @Patch('read')
  async markRead(@Body() data: { ids: string[] }) {
    return this.chatService.markAsRead(data.ids);
  }

  // ─── Order-linked chat ────────────────────────────────────────────────────

  /** Send (or start) a message in an order's dedicated chat thread */
  @Post('order/:orderId/send')
  async sendOrderMessage(
    @Param('orderId') orderId: string,
    @Body('content') content: string,
    @Request() req,
  ) {
    return this.chatService.sendOrderMessage(req.user.sub, orderId, content);
  }

  /** Get all messages for an order's chat thread */
  @Get('order/:orderId/messages')
  async getOrderMessages(@Param('orderId') orderId: string) {
    return this.chatService.getOrderMessages(orderId);
  }

  /** Customer: list all their orders that have active chat conversations */
  @Get('my-order-chats')
  async getMyOrderChats(@Request() req) {
    return this.chatService.getCustomerOrderChats(req.user.sub);
  }

  /** Admin/Support: list all orders with active chat conversations */
  @Get('admin/order-chats')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.OWNER, Role.LOGISTICS)
  async getAdminOrderChats() {
    return this.chatService.getAdminOrderChats();
  }
}
