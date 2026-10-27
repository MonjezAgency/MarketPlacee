import { Controller, Get, Post, Body, Param, UseGuards, Query, Request } from '@nestjs/common';
import { ShipmentService } from './shipment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';

@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  /** Public by tracking number; the payload depends on who asks (shipment-view.ts). */
  @Get('track')
  @UseGuards(OptionalJwtAuthGuard)
  async track(@Query('number') number: string, @Request() req: any) {
    return this.shipmentService.getTracking(number, req.user);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  async getByOrder(@Param('orderId') orderId: string, @Request() req: any) {
    return this.shipmentService.getShipmentForViewer(orderId, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() data: { orderId: string; trackingNumber?: string; carrier?: string; expectedDelivery?: Date }) {
    return this.shipmentService.createShipment(data.orderId, data);
  }

  @Post(':id/updates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async addUpdate(@Param('id') id: string, @Body() data: { status: string; description: string; location?: string }) {
    return this.shipmentService.addUpdate(id, data);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAll() {
    return this.shipmentService.getAllShipments();
  }
}
