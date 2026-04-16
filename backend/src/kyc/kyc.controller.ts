import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role, KYCStatus } from '@prisma/client';
import { KycService } from './kyc.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

const imageFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
    cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
    return;
  }
  cb(null, true);
};

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** Submit KYC with base64 / external image URLs (JSON body) */
  @Post('submit')
  async submitKyc(
    @Request() req,
    @Body() body: {
      documentType: string;
      frontImageUrl: string;
      backImageUrl?: string;
      selfieUrl?: string;
      livenessScore?: number;
    },
  ) {
    return this.kycService.submitKyc(req.user.sub, body);
  }

  /**
   * Submit KYC with file uploads (multipart/form-data).
   * Files are stored in memory and uploaded directly to Supabase Storage.
   * No files ever touch the local disk.
   */
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 3, {
      storage: memoryStorage(),
      fileFilter: imageFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
    }),
  )
  async uploadKycFiles(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { documentType: string; livenessScore?: string },
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const userId = req.user.sub;
    const [frontFile, backFile, selfieFile] = files;

    // Upload all files to Supabase in parallel
    const [frontPath, backPath, selfiePath] = await Promise.all([
      frontFile
        ? this.storage.uploadKycFile(userId, frontFile.buffer, frontFile.originalname, frontFile.mimetype)
        : Promise.resolve(''),
      backFile
        ? this.storage.uploadKycFile(userId, backFile.buffer, backFile.originalname, backFile.mimetype)
        : Promise.resolve(undefined),
      selfieFile
        ? this.storage.uploadKycFile(userId, selfieFile.buffer, selfieFile.originalname, selfieFile.mimetype)
        : Promise.resolve(undefined),
    ]);

    return this.kycService.submitKyc(userId, {
      documentType: body.documentType,
      frontImageUrl: frontPath,
      backImageUrl: backPath,
      selfieUrl: selfiePath,
      livenessScore: body.livenessScore ? parseFloat(body.livenessScore) : undefined,
    });
  }

  /** Get my KYC status */
  @Get('status')
  async getMyStatus(@Request() req) {
    return this.kycService.getMyKycStatus(req.user.sub);
  }

  /**
   * Get a temporary signed URL for a KYC file (admin only).
   * URLs expire after 1 hour for security.
   */
  @Get('admin/signed-url')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async getSignedUrl(@Query('path') path: string) {
    if (!path?.startsWith('supabase://')) {
      throw new BadRequestException('Invalid storage path');
    }
    const url = await this.storage.getSignedUrl(path);
    return { url };
  }

  /** Admin: get all pending submissions */
  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async getPending() {
    return this.kycService.getAllPending();
  }

  /** Admin: get all submissions with optional status filter */
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async getAll(@Query('status') status?: KYCStatus) {
    return this.kycService.getAll(status);
  }

  /** Admin: get KYC stats */
  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async getStats() {
    return this.kycService.getStats();
  }

  /** Admin: get single KYC document */
  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async getById(@Param('id') id: string) {
    return this.kycService.getById(id);
  }

  /** Admin: verify (approve) */
  @Patch('admin/:id/verify')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async verify(@Param('id') id: string, @Body() body: { adminNotes?: string }) {
    return this.kycService.verifyKyc(id, body.adminNotes);
  }

  /** Admin: reject */
  @Patch('admin/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  async reject(@Param('id') id: string, @Body() body: { adminNotes: string }) {
    return this.kycService.rejectKyc(id, body.adminNotes);
  }
}
