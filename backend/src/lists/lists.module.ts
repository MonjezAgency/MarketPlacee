import { Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { ListRemindersService } from './list-reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], providers: [ListsService, ListRemindersService], controllers: [ListsController] })
export class ListsModule {}
