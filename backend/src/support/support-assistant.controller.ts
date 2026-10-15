import { Body, Controller, Get, Param, Post, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupportAssistantService, SUPPORT_IMAGE_MAX } from './support-assistant.service';

const viewer = (req: any) => ({ id: req.user.sub, role: req.user.role });

/** The signed-in user's support conversation. The user is always taken from the token. */
@Controller('support-assistant')
@UseGuards(JwtAuthGuard)
export class SupportAssistantController {
    constructor(private readonly svc: SupportAssistantService) {}

    @Get('session')
    session(@Request() req) {
        return this.svc.session(viewer(req));
    }

    @Post('message')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    message(@Request() req, @Body() body: { content?: string; imageUrl?: string; cart?: any[] }) {
        return this.svc.message(viewer(req), body || {});
    }

    @Post('message/:id/retry')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    retry(@Request() req, @Param('id') id: string, @Body() body: { cart?: any[] }) {
        return this.svc.retry(viewer(req), id, body?.cart);
    }

    @Post('escalate')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    escalate(@Request() req, @Body() body: { note?: string }) {
        return this.svc.escalate(viewer(req), body?.note);
    }

    @Post('attachments')
    @Throttle({ default: { limit: 15, ttl: 60_000 } })
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SUPPORT_IMAGE_MAX } }))
    upload(@Request() req, @UploadedFile() file: any) {
        return this.svc.upload(viewer(req), file);
    }

    @Get('attachments/:owner/:file')
    async attachment(@Request() req, @Param('owner') owner: string, @Param('file') file: string, @Res() res: any) {
        const f = await this.svc.attachment(viewer(req), owner, file);
        res.setHeader('Content-Type', f.contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.send(f.buffer);
    }
}
