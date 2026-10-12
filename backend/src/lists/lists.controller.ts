import { Controller, Get, Post, Patch, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListsService } from './lists.service';

/** Buyer shopping lists. Every route is scoped to the signed-in user. */
@Controller('lists')
@UseGuards(JwtAuthGuard)
export class ListsController {
    constructor(private readonly lists: ListsService) {}

    @Get() all(@Request() req) { return this.lists.all(req.user.sub); }
    @Post() create(@Request() req, @Body('name') name: string) { return this.lists.create(req.user.sub, name); }
    @Post('from-order/:orderId') fromOrder(@Request() req, @Param('orderId') orderId: string, @Body() body: { listId?: string; name?: string }) {
        return this.lists.fromOrder(req.user.sub, orderId, body || {});
    }
    @Patch(':id') rename(@Request() req, @Param('id') id: string, @Body('name') name: string) { return this.lists.rename(req.user.sub, id, name); }
    @Delete(':id') remove(@Request() req, @Param('id') id: string) { return this.lists.remove(req.user.sub, id); }
    @Post(':id/items') add(@Request() req, @Param('id') id: string, @Body('items') items: any[]) { return this.lists.addItems(req.user.sub, id, items); }
    @Patch(':id/items/:itemId') qty(@Request() req, @Param('id') id: string, @Param('itemId') itemId: string, @Body('quantity') quantity: number) {
        return this.lists.setQty(req.user.sub, id, itemId, quantity);
    }
    @Delete(':id/items/:itemId') removeItem(@Request() req, @Param('id') id: string, @Param('itemId') itemId: string) {
        return this.lists.removeItem(req.user.sub, id, itemId);
    }
}
