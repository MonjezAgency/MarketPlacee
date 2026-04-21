import { Controller, Post, Get, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { EmailService } from '../email/email.service';
import { Role, UserStatus } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin/team')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER, Role.DEVELOPER)
export class TeamController {
    constructor(
        private readonly adminService: AdminService,
        private readonly emailService: EmailService,
    ) { }

    @Get()
    async getTeamMembers() {
        return this.adminService.getTeamMembers();
    }

    @Post('invite')
    async inviteMember(@Body() body: any) {
        return this.adminService.inviteTeamMember(body);
    }

    @Delete(':id')
    async deleteMember(@Param('id') id: string) {
        return this.adminService.deleteTeamMember(id);
    }

    @Post(':id/verify-kyc')
    @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER)
    async verifyKyc(@Param('id') id: string) {
        return this.adminService.verifyTeamMemberKyc(id);
    }

    @Post('send-invite')
    async sendInvite(@Body() body: { email: string; role: string; inviteLink: string }, @Req() req: any) {
        const senderName = req.user?.name || 'Atlantis Admin';
        try {
            const result = await this.emailService.sendInviteEmail({
                recipientEmail: body.email,
                role: body.role,
                inviteLink: body.inviteLink,
                senderName,
            });
            return { success: true, message: 'Invitation email sent!', ...result };
        } catch (error: any) {
            console.error('TEAM INVITE ERROR:', error);
            return { 
                success: false, 
                message: 'Failed to send invitation', 
                error: error.message || 'Unknown SMTP error' 
            };
        }
    }
}
