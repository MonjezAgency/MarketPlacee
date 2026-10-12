import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { dueReminder, missingProfileFields, REMINDER_1_AFTER_MIN } from './profile-completion';

/**
 * Onboarding reminders for accounts whose business profile is incomplete.
 * State lives in the database (no in-memory timers): each send is "claimed"
 * with a conditional update, so restarts, retries and multiple replicas can
 * never send the same reminder twice. A failed send releases the claim and
 * counts a failure (max 3), so the next run retries.
 */
@Injectable()
export class ProfileRemindersService {
    private readonly logger = new Logger(ProfileRemindersService.name);
    private running = false;
    constructor(private prisma: PrismaService, private email: EmailService) {}

    @Cron('*/5 * * * *')
    async tick() {
        if (process.env.PROFILE_REMINDERS_ENABLED === 'false' || this.running) return;
        this.running = true;
        try { await this.runOnce(); }
        catch (e: any) { this.logger.error(`Reminder run failed: ${e?.message}`); }
        finally { this.running = false; }
    }

    async runOnce(now = new Date()) {
        const candidates = await this.prisma.user.findMany({
            where: {
                onboardingCompleted: false, emailVerified: true,
                profileIncompleteSince: { lte: new Date(now.getTime() - REMINDER_1_AFTER_MIN * 60000) },
                profileReminder2SentAt: null,
                profileReminderFailures: { lt: 3 },
            } as any,
            take: 50,
        });
        let sent = 0;
        for (const u of candidates as any[]) {
            const step = dueReminder(u, now);
            if (!step) continue;
            const field = step === 1 ? 'profileReminder1SentAt' : 'profileReminder2SentAt';
            // Claim: only one process can flip this from null.
            const claim = await this.prisma.user.updateMany({ where: { id: u.id, [field]: null, onboardingCompleted: false } as any, data: { [field]: now } as any });
            if (claim.count !== 1) continue;
            // Re-check at delivery time: the buyer may have just finished.
            const fresh: any = await this.prisma.user.findUnique({ where: { id: u.id } });
            if (!fresh || fresh.onboardingCompleted || missingProfileFields(fresh).length === 0) {
                await this.prisma.user.updateMany({ where: { id: u.id }, data: { [field]: null } as any });
                continue;
            }
            const res = await this.email.sendProfileReminder(fresh.email, fresh.name || '', step, missingProfileFields(fresh)).catch((e: any) => ({ success: false, error: e?.message }));
            if (res.success) { sent++; this.logger.log(`Profile reminder ${step} sent to user ${u.id}`); }
            else {
                await this.prisma.user.updateMany({ where: { id: u.id }, data: { [field]: null, profileReminderFailures: { increment: 1 } } as any });
                this.logger.warn(`Profile reminder ${step} failed for user ${u.id}: ${res.error || 'provider error'}`);
            }
        }
        return { checked: candidates.length, sent };
    }
}
