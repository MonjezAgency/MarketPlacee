import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ShipmentService {
  constructor(private prisma: PrismaService) {}

  async createShipment(orderId: string, data: { trackingNumber?: string; carrier?: string; expectedDelivery?: Date }) {
    const trackingNumber = data.trackingNumber || `ATL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    return this.prisma.shipment.create({
      data: {
        orderId,
        trackingNumber,
        carrier: data.carrier,
        expectedDelivery: data.expectedDelivery,
        updates: {
          create: {
            status: 'ORDER_PLACED',
            description: 'Order has been placed and is being prepared for shipment.',
          }
        }
      },
      include: { updates: true }
    });
  }

  async addUpdate(shipmentId: string, data: { status: string; description: string; location?: string }) {
    return this.prisma.shipmentUpdate.create({
      data: {
        shipmentId,
        status: data.status,
        description: data.description,
        location: data.location,
      },
    });
  }

  async getTracking(trackingNumber: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { trackingNumber },
      include: { 
        updates: { orderBy: { createdAt: 'desc' } },
        order: {
          include: {
            customer: { select: { name: true, email: true } }
          }
        }
      }
    });

    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async getAllShipments() {
    return this.prisma.shipment.findMany({
      include: {
        order: {
          include: {
            customer: { select: { name: true } }
          }
        },
        updates: { take: 1, orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getShipmentByOrderId(orderId: string) {
    return this.prisma.shipment.findUnique({
      where: { orderId },
      include: { updates: { orderBy: { createdAt: 'desc' } } }
    });
  }
}
