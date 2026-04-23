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
    async sendInvite(@Body() body: { email: string | string[]; role: string; inviteLink: string }, @Req() req: any) {
        const senderName = req.user?.name || 'Atlantis Admin';
        const emails = Array.isArray(body.email) 
            ? body.email 
            : body.email.split(/[,\s\n]+/).filter(e => e.includes('@')).map(e => e.trim());

        if (emails.length === 0) {
            return { success: false, message: 'No valid emails provided' };
        }

        const results = await Promise.all(emails.map(async (email) => {
            try {
                const result = await this.emailService.sendInviteEmail({
                    recipientEmail: email,
                    role: body.role,
                    inviteLink: body.inviteLink,
                    senderName,
                });
                return { email, success: result.success };
            } catch (error) {
                return { email, success: false, error: 'SMTP/Delivery failure' };
            }
        }));

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        return {
            success: successCount > 0,
            summary: {
                total: emails.length,
                success: successCount,
                failed: failureCount
            },
            results,
            message: failureCount === 0 
                ? `Successfully sent ${successCount} invitations!` 
                : `Sent ${successCount} successfully, but ${failureCount} failed.`
        };
    }
}
