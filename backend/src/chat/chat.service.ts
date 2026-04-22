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
        orders: {
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
      const context = {
        userName: user?.name,
        userRole: user?.role,
        recentOrders: user?.orders.map(o => ({
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

  /**
   * Switch conversation from bot to human agent.
   * Marks all bot messages in this thread as handed over.
   */
  async switchToHuman(userId: string, agentId: string) {
    // Mark the conversation thread as handed over
    await this.prisma.supportMessage.updateMany({
      where: { senderId: userId, isBot: false, receiverId: null },
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
