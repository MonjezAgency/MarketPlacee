import { Controller, Get, Post, Body, UseGuards, Request, Param, Patch, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

const CHAT_STAFF = ['ADMIN', 'SUPPORT', 'DEVELOPER', 'LOGISTICS', 'OWNER'];

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  async sendMessage(@Request() req, @Body() data: { content?: string; imageUrl?: string; receiverId?: string }) {
    // Only support staff may address a message to a user; anyone else writes to support.
    const staff = CHAT_STAFF.includes(String(req.user.role || '').toUpperCase());
    return this.chatService.sendMessage(req.user.sub, { ...data, receiverId: staff ? data?.receiverId : undefined });
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
  async markRead(@Request() req, @Body() data: { ids: string[] }) {
    return this.chatService.markAsRead(data.ids, req.user.sub, CHAT_STAFF.includes(String(req.user.role || '').toUpperCase()));
  }

  // ─── Order-linked chat ────────────────────────────────────────────────────

  /** Send a message in the caller's own thread for this order (staff pick the thread with partyId). */
  @Post('order/:orderId/send')
  async sendOrderMessage(@Param('orderId') orderId: string, @Body('content') content: string, @Body('partyId') partyId: string, @Request() req) {
    const thread = await this.chatService.resolveOrderThread(orderId, req.user.sub, req.user.role, partyId);
    return this.chatService.sendOrderMessage(req.user.sub, orderId, content, thread);
  }

  /** Messages of the caller's own thread for this order (staff: ?party=<userId>, default the buyer). */
  @Get('order/:orderId/messages')
  async getOrderMessages(@Param('orderId') orderId: string, @Query('party') party: string, @Request() req) {
    const thread = await this.chatService.resolveOrderThread(orderId, req.user.sub, req.user.role, party);
    return this.chatService.getOrderMessages(orderId, thread);
  }

  /** Buyer or supplier: their own order threads. */
  @Get('my-order-chats')
  async getMyOrderChats(@Request() req) {
    return String(req.user.role || '').toUpperCase() === 'SUPPLIER'
      ? this.chatService.getSupplierOrderChats(req.user.sub)
      : this.chatService.getCustomerOrderChats(req.user.sub);
  }

  /** Admin/Support: list all orders with active chat conversations */
  @Get('admin/order-chats')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.OWNER, Role.LOGISTICS)
  async getAdminOrderChats() {
    return this.chatService.getAdminOrderChats();
  }
}
