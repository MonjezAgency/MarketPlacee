import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BotService } from './bot.service';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private botService: BotService,
  ) {}

  async sendMessage(senderId: string, data: { content?: string; imageUrl?: string; receiverId?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: senderId },
      include: {
        customerOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, totalAmount: true, createdAt: true }
        },
        supplierOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, totalAmount: true, createdAt: true }
        }
      }
    });

    const message = await this.prisma.supportMessage.create({
      data: {
        senderId,
        content: data.content,
        imageUrl: data.imageUrl,
        receiverId: data.receiverId || null,
      },
      include: {
        sender: {
          select: { name: true, role: true }
        }
      }
    });

    // Handle Notifications
    if (data.receiverId) {
      // Support replying to User
      await this.prisma.notification.create({
        data: {
          userId: data.receiverId,
          title: 'New Support Message',
          message: `Support replied to your inquiry: "${data.content?.substring(0, 50)}..."`,
          type: 'INFO'
        }
      });
    } else {
      // User sending to Support
      // Generate AI Response
      const allOrders = [
        ...(user?.customerOrders || []),
        ...(user?.supplierOrders || [])
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);

      const context = {
        userName: user?.name,
        userRole: user?.role,
        recentOrders: allOrders.map(o => ({
          id: o.id.slice(-8).toUpperCase(),
          status: o.status,
          amount: o.totalAmount,
          date: o.createdAt
        }))
      };

      const aiResponse = await this.botService.getResponse(data.content || '', [], context);
      
      // Save Bot Message
      const botMessage = await this.prisma.supportMessage.create({
        data: {
          senderId: message.senderId, // Keep it linked to the thread
          content: aiResponse.content,
          receiverId: message.senderId, // Replying back to the user
          isBot: true,
          assignedTeam: aiResponse.assignedTeam,
        }
      });

      // Find all Support agents and Admins (and the assigned team)
      const rolesToNotify = ['ADMIN', 'SUPPORT'];
      if (aiResponse.assignedTeam) {
        rolesToNotify.push(aiResponse.assignedTeam);
      }

      const supportUsers = await this.prisma.user.findMany({
        where: {
          role: { in: rolesToNotify as any }
        },
        select: { id: true }
      });

      // Create notifications for relevant staff
      await Promise.all(supportUsers.map(staff => 
        this.prisma.notification.create({
          data: {
            userId: staff.id,
            title: aiResponse.assignedTeam ? `New ${aiResponse.assignedTeam} Inquiry` : 'New User Inquiry',
            message: `${message.sender.name} sent a message: "${data.content?.substring(0, 50)}..."`,
            type: 'INFO'
          }
        })
      ));
      
      return { userMessage: message, botMessage };
    }

    return message;
  }

  async getMessages(userId1: string, userId2: string | null) {
    // If userId2 is null, it means we're looking for messages between userId1 and general support
    return this.prisma.supportMessage.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2 || 'SUPPORT', receiverId: userId1 }, 
        ],
      },
      include: {
        sender: {
          select: { name: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getConversations(userRole: string) {
    // For support agents: get unique users who have sent messages
    const where: any = { receiverId: null };

    // Apply Team Filtering
    if (userRole === 'DEVELOPER') {
      where.assignedTeam = 'DEVELOPER';
    } else if (userRole === 'LOGISTICS') {
      where.assignedTeam = 'LOGISTICS';
    } else if (userRole !== 'ADMIN' && userRole !== 'SUPPORT') {
      // Non-support roles shouldn't access this
      return [];
    }

    const messages = await this.prisma.supportMessage.findMany({
      where,
      distinct: ['senderId'],
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    });
    return messages.map(m => m.sender);
  }

  async getMessagesForUser(userId: string) {
     // Get all messages where user is sender (to support) or receiver (from support)
     return this.prisma.supportMessage.findMany({
       where: {
         OR: [
           { senderId: userId, receiverId: null }, // User to Support
           { receiverId: userId } // Support to User
         ]
       },
       include: {
         sender: {
           select: { name: true, role: true }
         }
       },
       orderBy: { createdAt: 'asc' }
     });
  }

  async markAsRead(messageIds: string[]) {
    return this.prisma.supportMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { isRead: true }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER-LINKED CHAT — dedicated per-order conversation between admin & buyer
  // ─────────────────────────────────────────────────────────────────────────

  /** Admin initiates or continues a conversation tied to a specific order */
  async sendOrderMessage(senderId: string, orderId: string, content: string) {
    // Resolve the order so we can notify the other party
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, supplierId: true, totalAmount: true, status: true },
    });
    if (!order) throw new Error('Order not found');

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, name: true, role: true },
    });

    const message = await this.prisma.supportMessage.create({
      data: {
        senderId,
        orderId,
        content,
        receiverId: null,   // null = "general"; orderId carries the thread context
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    // Determine who to notify
    const isStaff = ['ADMIN', 'OWNER', 'SUPPORT', 'LOGISTICS'].includes(sender?.role || '');
    const notifyUserId = isStaff ? order.customerId : null;

    if (notifyUserId) {
      await this.prisma.notification.create({
        data: {
          userId: notifyUserId,
          title: 'New message about your order',
          message: `You have a new message about order #${orderId.slice(-8).toUpperCase()}: "${content.substring(0, 60)}${content.length > 60 ? '…' : ''}"`,
          type: 'INFO',
        },
      }).catch(() => {});
    } else if (!isStaff) {
      // Customer sent — notify admins
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPPORT', 'OWNER'] } },
        select: { id: true },
        take: 5,
      });
      await Promise.all(admins.map(a =>
        this.prisma.notification.create({
          data: {
            userId: a.id,
            title: 'Customer replied on order',
            message: `${sender?.name} replied on order #${orderId.slice(-8).toUpperCase()}: "${content.substring(0, 60)}"`,
            type: 'INFO',
          },
        }).catch(() => {}),
      ));
    }

    return message;
  }

  /** Get all messages for a specific order's chat thread */
  async getOrderMessages(orderId: string) {
    return this.prisma.supportMessage.findMany({
      where: { orderId },
      include: { sender: { select: { id: true, name: true, role: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Customer: get a list of orders that have chat messages (for "Order Conversations" tab) */
  async getCustomerOrderChats(customerId: string) {
    // Find all orders belonging to this customer that have any chat message
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        chatMessages: { some: {} },
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true, sender: { select: { name: true, role: true } } },
        },
        items: {
          take: 1,
          select: { product: { select: { name: true, images: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return orders.map(o => ({
      orderId: o.id,
      status: o.status,
      total: o.totalAmount,
      createdAt: o.createdAt,
      firstProduct: o.items[0]?.product?.name ?? null,
      firstImage: o.items[0]?.product?.images?.[0] ?? null,
      lastMessage: o.chatMessages[0]?.content ?? null,
      lastMessageAt: o.chatMessages[0]?.createdAt ?? null,
      lastMessageSender: o.chatMessages[0]?.sender?.name ?? null,
    }));
  }

  /** Admin: get all orders that have chat messages */
  async getAdminOrderChats() {
    const orders = await this.prisma.order.findMany({
      where: { chatMessages: { some: {} } },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        customer: { select: { id: true, name: true, email: true } },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            isRead: true,
            sender: { select: { name: true, role: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return orders.map(o => ({
      orderId: o.id,
      status: o.status,
      total: o.totalAmount,
      createdAt: o.createdAt,
      customer: o.customer,
      lastMessage: o.chatMessages[0]?.content ?? null,
      lastMessageAt: o.chatMessages[0]?.createdAt ?? null,
      lastMessageSender: o.chatMessages[0]?.sender?.name ?? null,
      unread: o.chatMessages[0]?.isRead === false ? 1 : 0,
    }));
  }

  /**
   * Switch conversation from bot to human agent.
   * Marks all bot messages in this thread as handed over.
   */
  async switchToHuman(userId: string, agentId: string) {
    // Mark the conversation thread as handed over
    await this.prisma.supportMessage.updateMany({
      where: { senderId: userId, receiverId: null },
      data: { isHandedOver: true, handedOverBy: agentId },
    });

    // Post a system message so the user knows a human took over
    const systemMessage = await this.prisma.supportMessage.create({
      data: {
        senderId: agentId,
        receiverId: userId,
        content: '✅ تم تحويل المحادثة إلى أحد أعضاء فريق الدعم. كيف يمكنني مساعدتك؟',
        isBot: false,
        isHandedOver: true,
        handedOverBy: agentId,
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    return { success: true, systemMessage };
  }

  async switchToAI(userId: string, agentId: string) {
    // Reset handover status
    await this.prisma.supportMessage.updateMany({
      where: { senderId: userId, receiverId: null },
      data: { isHandedOver: false, handedOverBy: null },
    });

    // Post a system message (generic sender to maintain privacy as requested)
    const systemMessage = await this.prisma.supportMessage.create({
      data: {
        senderId: agentId, 
        receiverId: userId,
        content: '🤖 تم إعادة تفعيل مساعد الذكاء الاصطناعي لمساعدتك.',
        isBot: true,
        isHandedOver: false,
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    return { success: true, systemMessage };
  }

  /**
   * Get all conversations for support panel with unread count + handover status.
   */
  async getConversationsWithStatus(userRole: string) {
    const where: any = { receiverId: null };
    if (userRole === 'DEVELOPER') where.assignedTeam = 'DEVELOPER';
    else if (userRole === 'LOGISTICS') where.assignedTeam = 'LOGISTICS';
    else if (userRole !== 'ADMIN' && userRole !== 'SUPPORT' && userRole !== 'OWNER') return [];

    // Get latest message per user (distinct by senderId)
    const latestMessages = await this.prisma.supportMessage.findMany({
      where,
      distinct: ['senderId'],
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
    });

    // For each conversation, get unread count + handover status
    const enriched = await Promise.all(
      latestMessages.map(async (m) => {
        const [unreadCount, lastMsg, handedOver] = await Promise.all([
          this.prisma.supportMessage.count({
            where: { senderId: m.senderId, receiverId: null, isRead: false },
          }),
          this.prisma.supportMessage.findFirst({
            where: {
              OR: [
                { senderId: m.senderId, receiverId: null },
                { receiverId: m.senderId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            select: { content: true, isBot: true, createdAt: true },
          }),
          this.prisma.supportMessage.findFirst({
            where: { senderId: m.senderId, isHandedOver: true },
            select: { isHandedOver: true },
          }),
        ]);

        return {
          ...m.sender,
          unread: unreadCount,
          lastMessage: lastMsg?.content?.substring(0, 60),
          lastMessageAt: lastMsg?.createdAt,
          isBot: lastMsg?.isBot,
          isHandedOver: !!handedOver,
        };
      }),
    );

    return enriched.sort(
      (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
    );
  }
}
