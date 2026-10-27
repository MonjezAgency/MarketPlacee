import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { isOrderParty, isShipmentStaff, publicTrackingView, type ShipmentViewer } from './shipment-view';

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

  /**
   * Tracking by number. Anyone with the number sees the shipment's progress
   * only (carrier, status, expected date, updates). The order summary is added
   * for the order's buyer (staff get the full record) — never the
   * buyer's identity, address, payment or terms (see shipment-view.ts).
   */
  async getTracking(trackingNumber: string, viewer?: ShipmentViewer | null) {
    const number = String(trackingNumber || '').trim();
    if (!number) throw new BadRequestException('A tracking number is required.');
    const shipment = await this.prisma.shipment.findUnique({
      where: { trackingNumber: number },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        order: {
          include: {
            customer: { select: { name: true, email: true } },
            items: { select: { product: { select: { supplierId: true } } } },
          }
        }
      }
    });

    if (!shipment) throw new NotFoundException('Shipment not found');
    if (isShipmentStaff(viewer)) return shipment;
    return publicTrackingView(shipment, isOrderParty(viewer, shipment.order as any), viewer);
  }

  /** The shipment of an order, for that order's buyer, a supplier on it, or staff only. */
  async getShipmentForViewer(orderId: string, viewer: ShipmentViewer) {
    if (!isShipmentStaff(viewer)) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, supplierId: true, items: { select: { product: { select: { supplierId: true } } } } },
      });
      if (!order || !isOrderParty(viewer, order as any)) throw new NotFoundException('Shipment not found');
    }
    return this.getShipmentByOrderId(orderId);
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
