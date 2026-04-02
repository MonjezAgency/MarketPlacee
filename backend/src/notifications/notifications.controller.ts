import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    findAll(@Request() req) {
        return this.notificationsService.findByUser(req.user.sub);
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
