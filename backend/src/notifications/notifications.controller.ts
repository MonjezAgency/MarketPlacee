import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    findAll(@Request() req, @Query('filter') filter?: string, @Query('before') before?: string, @Query('limit') limit?: string) {
        return this.notificationsService.findByUser(req.user.sub, { unread: filter === 'unread', before, limit: limit ? Number(limit) : undefined });
    }

    @Get('unread-count')
    getUnreadCount(@Request() req) {
        return this.notificationsService.getUnreadCount(req.user.sub).then(count => ({ count }));
    }

    @Patch(':id/read')
    markRead(@Param('id') id: string, @Request() req) {
        return this.notificationsService.markRead(id, req.user.sub);
    }

    @Patch('read-all')
    markAllRead(@Request() req) {
        return this.notificationsService.markAllRead(req.user.sub);
    }
}
