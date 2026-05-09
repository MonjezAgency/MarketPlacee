import {
    Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards,
    UseInterceptors, UploadedFile, Req, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OffersService } from './offers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OffersController {
    constructor(private readonly svc: OffersService) {}

    /** Supplier creates a single offer manually. Admin/Owner can also
     *  post on behalf of a supplier (e.g. when fixing a sheet). */
    @Post()
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER)
    async create(@Req() req: any, @Body() body: any) {
        const role = (req.user.role || '').toUpperCase();
        const isAdmin = role === 'ADMIN' || role === 'OWNER';
        // When an admin posts on behalf of someone, they must include
        // an explicit body.supplierId; otherwise we credit the offer
        // to themselves (rare path, only useful for testing).
        const supplierId = isAdmin && body?.supplierId ? body.supplierId : req.user.sub;
        return this.svc.create(supplierId, body, isAdmin);
    }

    /** Supplier bulk-uploads offers from a CSV / XLS / XLSX. Each row
     *  is matched ONLY against the supplier's own approved products. */
    @Post('bulk-upload')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER)
    @UseInterceptors(FileInterceptor('file'))
    async bulkUpload(@Req() req: any, @UploadedFile() file: any) {
        if (!file?.buffer) {
            throw new BadRequestException('Upload a CSV / Excel file under the "file" field.');
        }
        const role = (req.user.role || '').toUpperCase();
        const isAdmin = role === 'ADMIN' || role === 'OWNER';
        return this.svc.bulkUpload(req.user.sub, file.buffer, isAdmin);
    }

    /** Supplier sees their own offers (any status). */
    @Get('mine')
    @Roles(Role.SUPPLIER)
    async listMine(@Req() req: any) {
        return this.svc.listMine(req.user.sub);
    }

    /** Admin queue + filter. */
    @Get()
    @Roles(Role.ADMIN, Role.OWNER, Role.MODERATOR)
    async listAll(@Query('status') status?: string) {
        return this.svc.listAll(status);
    }

    @Get(':id')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER, Role.MODERATOR)
    async findOne(@Param('id') id: string) {
        return this.svc.findById(id);
    }

    @Patch(':id/approve')
    @Roles(Role.ADMIN, Role.OWNER)
    async approve(@Param('id') id: string, @Req() req: any) {
        return this.svc.approve(id, req.user.sub);
    }

    @Patch(':id/reject')
    @Roles(Role.ADMIN, Role.OWNER)
    async reject(@Param('id') id: string, @Req() req: any, @Body('reason') reason?: string) {
        return this.svc.reject(id, req.user.sub, reason);
    }

    @Delete(':id')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER)
    async delete(@Param('id') id: string, @Req() req: any) {
        return this.svc.deleteOne(id, req.user.sub, req.user.role);
    }
}
