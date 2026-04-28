import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class NewsletterService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService
    ) {}

    async subscribe(email: string, source?: string, region?: string) {
        const existing = await this.prisma.newsletterSubscriber.findUnique({
            where: { email }
        });

        if (existing) {
            if (existing.status === 'ACTIVE') {
                throw new ConflictException('Already subscribed');
            }
            return this.prisma.newsletterSubscriber.update({
                where: { email },
                data: { status: 'ACTIVE', source: source || existing.source }
            });
        }

        return this.prisma.newsletterSubscriber.create({
            data: { email, source, region }
        });
    }

    async findAll() {
        const subscribers = await this.prisma.newsletterSubscriber.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const emails = subscribers.map(s => s.email);
        const users = await this.prisma.user.findMany({
            where: { email: { in: emails } },
            select: { email: true, id: true, name: true, avatar: true, role: true }
        });

        const userMap = new Map(users.map(u => [u.email, u]));

        return subscribers.map(sub => ({
            ...sub,
            user: userMap.get(sub.email) || null
        }));
    }

    async remove(id: string) {
        return this.prisma.newsletterSubscriber.delete({
            where: { id }
        });
    }

    async sendCampaign(subject: string, content: string) {
        const subscribers = await this.prisma.newsletterSubscriber.findMany({
            where: { status: 'ACTIVE' }
        });

        const results = await Promise.all(
            subscribers.map(sub => 
                this.emailService.sendMail(sub.email, subject, `
                    <div style="font-family: sans-serif; padding: 40px; color: #333; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #eee;">
                        <h1 style="color: #0F172A; font-size: 24px; font-weight: 900; margin-bottom: 24px;">Atlantis Marketplace</h1>
                        <div style="font-size: 16px; line-height: 1.6; color: #555;">
                            ${content.replace(/\n/g, '<br/>')}
                        </div>
                        <hr style="margin: 40px 0; border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 12px; color: #999; text-align: center;">
                            You received this because you subscribed to Atlantis Marketplace updates.<br/>
                            © 2026 Atlantis Marketplace. All rights reserved.
                        </p>
                    </div>
                `)
            )
        );

        return {
            total: subscribers.length,
            successCount: results.filter(r => r).length
        };
    }
}
