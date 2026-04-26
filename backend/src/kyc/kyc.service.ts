import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { KYCStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private aiAgent: AiAgentService,
    private notificationsService: NotificationsService,
  ) {}

  /** Submit or re-submit KYC documents */
  async submitKyc(
    userId: string,
    data: {
      documentType: string;
      frontImageUrl: string;
      backImageUrl?: string;
      selfieUrl?: string;
      livenessScore?: number;
    },
  ) {
    // Validate document type
    const validTypes = ['NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENSE', 'RESIDENCE_PERMIT'];
    if (!validTypes.includes(data.documentType)) {
      throw new BadRequestException(`Invalid document type. Allowed: ${validTypes.join(', ')}`);
    }

    // Must have frontImage
    if (!data.frontImageUrl) {
      throw new BadRequestException('Front image is required');
    }

    // Check if user already has a pending/verified doc
    const existing = await this.prisma.kYCDocument.findFirst({
      where: { userId, status: { in: [KYCStatus.VERIFIED] } },
    });
    if (existing) {
      throw new ForbiddenException('Your identity is already verified');
    }

    // Calculate basic liveness score if not provided (placeholder — replace with real AI check)
    const livenessScore = data.livenessScore ?? (data.selfieUrl ? 0.85 : null);

    // Upsert: update if PENDING/REJECTED exists, else create
    const existingDoc = await this.prisma.kYCDocument.findFirst({
      where: { userId, status: { in: [KYCStatus.PENDING, KYCStatus.REJECTED] } },
    });

    if (existingDoc) {
      return this.prisma.kYCDocument.update({
        where: { id: existingDoc.id },
        data: {
          documentType: data.documentType,
          frontImageUrl: data.frontImageUrl,
          backImageUrl: data.backImageUrl ?? null,
          selfieUrl: data.selfieUrl ?? null,
          livenessScore,
          status: KYCStatus.PENDING,
          adminNotes: null,
        },
      });
    }

    const doc = await this.prisma.kYCDocument.create({
      data: {
        userId,
        documentType: data.documentType,
        frontImageUrl: data.frontImageUrl,
        backImageUrl: data.backImageUrl ?? null,
        selfieUrl: data.selfieUrl ?? null,
        livenessScore,
        status: KYCStatus.PENDING,
      },
    });

    // Update user kycStatus to PENDING
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KYCStatus.PENDING },
      select: { email: true, name: true },
    });

    // Platform notification for User
    await this.notificationsService.notifyUser(
      userId,
      'KYC Submitted Successfully',
      'Your identity documents have been submitted and are under review. We\'ll notify you once reviewed — usually within 24 hours.',
      'INFO'
    ).catch(() => {});

    // Platform notification for Admins
    await this.notificationsService.notifyAdmins(
      'New KYC Submission',
      `${updatedUser.name} (${updatedUser.email}) has submitted KYC documents for review.`,
      'INFO',
      { userId, docId: doc.id }
    ).catch(() => {});

    // Email notification
    if (updatedUser.email) {
      this.emailService.sendKycStatusEmail(
        updatedUser.email,
        updatedUser.name || 'Partner',
        'PENDING',
      ).catch(() => {});
    }
    // Trigger Smart AI Verification (Background)
    this.runSmartVerification(doc.id).catch(err => this.logger.error(`[KYC_PROCESSOR_FAIL]: ${err.message}`));

    return doc;
  }

  /**
   * AI Identity Analysis using Gemini Vision
   */
  private async runSmartVerification(docId: string) {
    this.logger.log(`[KYC_AI_PROCESSOR] Starting AI analysis for doc: ${docId}`);
    
    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      include: { user: true },
    });

    if (!doc || doc.status !== KYCStatus.PENDING) return;

    try {
        const result = await this.aiAgent.verifyKYCDocument(doc.frontImageUrl, doc.backImageUrl || undefined);
        
        if (result.approved) {
            this.logger.log(`[KYC_AI_PROCESSOR] PASS: AI Approved doc ${docId}. Reason: ${result.reason}`);
            await this.verifyKyc(doc.id, `AI-Automated: ${result.reason}`);
        } else {
            this.logger.warn(`[KYC_AI_PROCESSOR] FAIL: AI Rejected doc ${docId}. Reason: ${result.reason}`);
            // Automatically reject if AI is confident
            await this.rejectKyc(doc.id, `AI-Automated Rejection: ${result.reason}`);
        }
    } catch (err) {
        this.logger.error(`[KYC_AI_PROCESSOR] Critical failure: ${err.message}`);
    }
  }

  /** Get KYC status for the current user */
  async getMyKycStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    });

    const doc = await this.prisma.kYCDocument.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { kycStatus: user?.kycStatus, document: doc };
  }

  /** Admin: get all pending KYC submissions */
  async getAllPending() {
    return this.prisma.kYCDocument.findMany({
      where: { status: KYCStatus.PENDING },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Admin: get all KYC submissions (with optional filter) */
  async getAll(status?: KYCStatus) {
    return this.prisma.kYCDocument.findMany({
      where: status ? { status } : {},
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin: get KYC document by ID */
  async getById(docId: string) {
    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!doc) throw new NotFoundException('KYC document not found');
    return doc;
  }

  /** Admin: verify (approve) a KYC document */
  async verifyKyc(docId: string, adminNotes?: string) {
    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!doc) throw new NotFoundException('KYC document not found');

    const updated = await this.prisma.kYCDocument.update({
      where: { id: docId },
      data: { status: KYCStatus.VERIFIED, adminNotes: adminNotes ?? null },
    });

    // Update user kycStatus
    await this.prisma.user.update({
      where: { id: doc.userId },
      data: { kycStatus: KYCStatus.VERIFIED },
    });

    // Send email notification
    if (doc.user?.email) {
      this.emailService.sendKycStatusEmail(doc.user.email, doc.user.name || 'Partner', 'VERIFIED').catch(() => {});
    }

    // Platform notification
    await this.notificationsService.notifyUser(
      doc.userId,
      'Identity Verified',
      'Congratulations! Your identity has been verified. You now have full access to listing and trading.',
      'SUCCESS'
    ).catch(() => {});

    return updated;
  }

  /** Admin: reject a KYC document */
  async rejectKyc(docId: string, adminNotes: string) {
    if (!adminNotes?.trim()) {
      throw new BadRequestException('Admin notes are required when rejecting KYC');
    }

    const doc = await this.prisma.kYCDocument.findUnique({
      where: { id: docId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!doc) throw new NotFoundException('KYC document not found');

    const updated = await this.prisma.kYCDocument.update({
      where: { id: docId },
      data: { status: KYCStatus.REJECTED, adminNotes },
    });

    // Update user kycStatus back to UNVERIFIED so they can resubmit
    await this.prisma.user.update({
      where: { id: doc.userId },
      data: { kycStatus: KYCStatus.UNVERIFIED },
    });

    // Send rejection email with notes
    if (doc.user?.email) {
      this.emailService.sendKycStatusEmail(doc.user.email, doc.user.name || 'Partner', 'REJECTED', adminNotes).catch(() => {});
    }

    // Platform notification
    await this.notificationsService.notifyUser(
      doc.userId,
      'Identity Verification Failed',
      `Your KYC submission was rejected. Reason: ${adminNotes}`,
      'ERROR'
    ).catch(() => {});

    return updated;
  }

  /** Stats for admin dashboard */
  async getStats() {
    const [pending, verified, rejected, unverified] = await Promise.all([
      this.prisma.kYCDocument.count({ where: { status: KYCStatus.PENDING } }),
      this.prisma.kYCDocument.count({ where: { status: KYCStatus.VERIFIED } }),
      this.prisma.kYCDocument.count({ where: { status: KYCStatus.REJECTED } }),
      this.prisma.user.count({ where: { kycStatus: KYCStatus.UNVERIFIED } }),
    ]);
    return { pending, verified, rejected, unverified };
  }

  /** Quick verify multiple users by email (dev/admin utility) */
  async quickVerifyByEmails(emails: string[]) {
    const results = [];
    for (const email of emails) {
      try {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
          results.push({ email, status: 'USER_NOT_FOUND' });
          continue;
        }

        let doc = await this.prisma.kYCDocument.findFirst({ where: { userId: user.id } });

        if (doc) {
          await this.prisma.kYCDocument.update({
            where: { id: doc.id },
            data: { status: KYCStatus.VERIFIED, livenessScore: 1.0 },
          });
        } else {
          doc = await this.prisma.kYCDocument.create({
            data: {
              userId: user.id,
              documentType: 'PASSPORT',
              frontImageUrl: 'admin-quick-verified',
              livenessScore: 1.0,
              status: KYCStatus.VERIFIED,
            },
          });
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: { kycStatus: KYCStatus.VERIFIED },
        });

        results.push({ email, status: 'VERIFIED', userId: user.id, docId: doc.id });
        this.logger.log(`[QUICK_VERIFY] User ${email} (${user.id}) verified`);
      } catch (err) {
        results.push({ email, status: 'ERROR', error: err.message });
      }
    }
    return results;
  }
}
