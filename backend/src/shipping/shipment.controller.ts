import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ShipmentService } from './shipment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get('track')
  async track(@Query('number') number: string) {
    return this.shipmentService.getTracking(number);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  async getByOrder(@Param('orderId') orderId: string) {
    return this.shipmentService.getShipmentByOrderId(orderId);
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
