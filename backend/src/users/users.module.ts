import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileRemindersService } from './profile-reminders.service';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [PrismaModule, EmailModule, StorageModule],
    providers: [UsersService, ProfileRemindersService],
    controllers: [UsersController],
    exports: [UsersService],
})
export class UsersModule { }
