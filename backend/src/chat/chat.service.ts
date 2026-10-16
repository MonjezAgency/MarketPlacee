import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BotService } from './bot.service';

const ORDER_CHAT_STAFF = ['ADMIN', 'SUPPORT', 'OWNER', 'LOGISTICS', 'DEVELOPER'];

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

      // A person has taken over this conversation: no automatic reply.
      const lastOwn = await this.prisma.supportMessage.findFirst({ where: { senderId, receiverId: null, orderId: null, id: { not: message.id } }, orderBy: { createdAt: 'desc' }, select: { isHandedOver: true } });
      if (lastOwn?.isHandedOver) {
        await this.prisma.supportMessage.update({ where: { id: message.id }, data: { isHandedOver: true } }).catch(() => {});
        return { userMessage: message, botMessage: null };
      }
      const aiResponse = await this.botService.getResponse(data.content || '', [], context);
      // Provider failure: keep the user's message, don't store a fake answer.
      if (aiResponse.failed) return { userMessage: message, botMessage: null };

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

  /** Order chat: the order's buyer, a supplier with products in it, or support staff. */
  async markAsRead(messageIds: string[], userId?: string, isStaff = false) {
    return this.prisma.supportMessage.updateMany({
      // Users mark only messages addressed to them; staff mark messages sent to support.
      where: { id: { in: Array.isArray(messageIds) ? messageIds.slice(0, 500) : [] }, ...(isStaff ? {} : { receiverId: userId ?? '__none__' }) },
      data: { isRead: true }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER-LINKED CHAT — dedicated per-order conversation between admin & buyer
  // ─────────────────────────────────────────────────────────────────────────

  // Order threads: one per participant (the buyer, or one supplier on the order),
  // each between that participant and the Atlantis team. A participant only ever
  // sees their own thread; staff see every thread. partyId null = the buyer
  // (messages written before supplier threads existed).

  /** Which thread of this order the caller is in (staff may pick one). Throws if they have none. */
  async resolveOrderThread(orderId: string, userId: string, role?: string, requestedParty?: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true, supplierId: true, status: true } });
    if (!order) throw new NotFoundException('Order not found');
    const isStaff = ORDER_CHAT_STAFF.includes(String(role || '').toUpperCase());
    const supplies = async (id: string) => order.supplierId === id || (await this.prisma.orderItem.count({ where: { orderId, product: { supplierId: id } } })) > 0;
    if (isStaff) {
      const party = requestedParty || order.customerId;
      if (party === order.customerId) return { order, partyId: order.customerId, kind: 'buyer' as const, isStaff };
      if (await supplies(party)) return { order, partyId: party, kind: 'supplier' as const, isStaff };
      throw new BadRequestException('That person isn’t a buyer or supplier on this order.');
    }
    if (order.customerId === userId) return { order, partyId: userId, kind: 'buyer' as const, isStaff };
    if (await supplies(userId)) return { order, partyId: userId, kind: 'supplier' as const, isStaff };
    throw new ForbiddenException('Not your order.');
  }

  private threadWhere(orderId: string, kind: 'buyer' | 'supplier', partyId: string) {
    return kind === 'buyer'
      ? { orderId, OR: [{ partyId: null }, { partyId }] }
      : { orderId, partyId };
  }

  async sendOrderMessage(senderId: string, orderId: string, contentIn: string, thread: Awaited<ReturnType<ChatService['resolveOrderThread']>>) {
    const content = String(contentIn || '').trim();
    if (!content) throw new BadRequestException('Write a message first.');
    if (content.length > 4000) throw new BadRequestException('Messages can be up to 4,000 characters.');
    const ref = `#${orderId.slice(-8).toUpperCase()}`;
    const message = await this.prisma.supportMessage.create({
      data: { senderId, orderId, partyId: thread.partyId, content, receiverId: null },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });
    if (thread.isStaff) {
      // Atlantis wrote: tell the participant of this thread only.
      await this.prisma.notification.create({
        data: {
          userId: thread.partyId,
          title: thread.kind === 'supplier' ? `Atlantis wrote about order ${ref}` : 'New message about your order',
          message: `You have a new message about order ${ref}: "${content.substring(0, 60)}${content.length > 60 ? '…' : ''}"`,
          type: 'INFO',
          data: { orderId, link: thread.kind === 'supplier' ? '/supplier/support?tab=orders' : '/dashboard/support?tab=orders' },
        },
      }).catch(() => {});
    } else {
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPPORT', 'OWNER'] } }, select: { id: true }, take: 5 });
      const who = thread.kind === 'supplier' ? 'Supplier' : 'Customer';
      await Promise.all(admins.map((a) => this.prisma.notification.create({
        data: { userId: a.id, title: `${who} wrote on order ${ref}`, message: `${message.sender?.name || who} wrote on order ${ref}: "${content.substring(0, 60)}"`, type: 'INFO' },
      }).catch(() => {})));
    }
    return message;
  }

  async getOrderMessages(orderId: string, thread: Awaited<ReturnType<ChatService['resolveOrderThread']>>) {
    return this.prisma.supportMessage.findMany({
      where: this.threadWhere(orderId, thread.kind, thread.partyId),
      include: { sender: { select: { id: true, name: true, role: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Buyer: orders with a thread (their own thread only). */
  async getCustomerOrderChats(customerId: string) {
    const mine = { OR: [{ partyId: null }, { partyId: customerId }] };
    const orders = await this.prisma.order.findMany({
      where: { customerId, chatMessages: { some: mine } },
      select: {
        id: true, status: true, totalAmount: true, createdAt: true,
        chatMessages: { where: mine, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true, sender: { select: { name: true, role: true } } } },
        items: { take: 1, select: { productNameSnapshot: true, product: { select: { name: true, images: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return orders.map((o: any) => ({
      orderId: o.id, status: o.status, total: o.totalAmount, createdAt: o.createdAt,
      firstProduct: o.items[0]?.product?.name ?? o.items[0]?.productNameSnapshot ?? null,
      firstImage: o.items[0]?.product?.images?.[0] ?? null,
      lastMessage: o.chatMessages[0]?.content ?? null, lastMessageAt: o.chatMessages[0]?.createdAt ?? null,
      lastMessageSender: o.chatMessages[0]?.sender?.name ?? null,
      lastFromStaff: ORDER_CHAT_STAFF.includes(String(o.chatMessages[0]?.sender?.role || '')),
    }));
  }

  /** Supplier: orders with their own thread. Only their own lines; never the buyer total. */
  async getSupplierOrderChats(supplierId: string) {
    const mine = { partyId: supplierId };
    const orders = await this.prisma.order.findMany({
      where: { chatMessages: { some: mine } },
      select: {
        id: true, status: true, createdAt: true,
        chatMessages: { where: mine, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true, sender: { select: { name: true, role: true } } } },
        items: { where: { product: { supplierId } }, take: 1, select: { productNameSnapshot: true, product: { select: { name: true, images: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return orders.map((o: any) => ({
      orderId: o.id, status: o.status, createdAt: o.createdAt,
      firstProduct: o.items[0]?.product?.name ?? o.items[0]?.productNameSnapshot ?? null,
      firstImage: o.items[0]?.product?.images?.[0] ?? null,
      lastMessage: o.chatMessages[0]?.content ?? null, lastMessageAt: o.chatMessages[0]?.createdAt ?? null,
      lastMessageSender: o.chatMessages[0]?.sender?.name ?? null,
      lastFromStaff: ORDER_CHAT_STAFF.includes(String(o.chatMessages[0]?.sender?.role || '')),
    }));
  }

  /** Staff: every order thread (one row per order and participant). */
  async getAdminOrderChats() {
    const rows = await this.prisma.supportMessage.findMany({
      where: { orderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: { orderId: true, partyId: true, content: true, createdAt: true, isRead: true, sender: { select: { name: true, role: true } } },
    });
    const orderIds = [...new Set(rows.map((r) => r.orderId as string))];
    const orders = await this.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true, totalAmount: true, createdAt: true, customerId: true, customer: { select: { id: true, name: true, email: true } } } });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const threads = new Map<string, any>();
    for (const r of rows) {
      const o = byId.get(r.orderId as string);
      if (!o) continue;
      const party = r.partyId || o.customerId;
      const key = `${o.id}|${party}`;
      if (!threads.has(key)) threads.set(key, { o, party, last: r });
    }
    const partyIds = [...new Set([...threads.values()].map((t) => t.party).filter((p) => p))];
    const people = await this.prisma.user.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true, companyName: true, role: true } });
    const who = new Map(people.map((u) => [u.id, u]));
    return [...threads.values()].map(({ o, party, last }) => {
      const p = who.get(party);
      const kind = party === o.customerId ? 'buyer' : 'supplier';
      return {
        orderId: o.id, status: o.status, total: o.totalAmount, createdAt: o.createdAt,
        customer: o.customer,
        partyId: party, partyKind: kind, partyName: p?.companyName || p?.name || (kind === 'buyer' ? 'Customer' : 'Supplier'),
        lastMessage: last.content ?? null, lastMessageAt: last.createdAt ?? null, lastMessageSender: last.sender?.name ?? null,
        unread: last.isRead === false && !ORDER_CHAT_STAFF.includes(String(last.sender?.role || '')) ? 1 : 0,
      };
    });
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
