import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ImageDiscoveryService } from './image-discovery.service';

/**
 * Admin → Products → Product photos: products that need a photo or have
 * photos found by barcode waiting for review, with the reason.
 *
 * Catalog staff (owner, admin, moderator) see the list and can ask for a new
 * search. Choosing a found photo changes a product, so it is owner/admin only
 * and only for Atlantis Catalog products: a supplier's product photos are the
 * supplier's to choose (staff see the status, never the photos' application).
 */
@Controller('admin-product-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminProductPhotosController {
    constructor(private readonly discovery: ImageDiscoveryService) {}

    @Get()
    @Roles(Role.ADMIN, Role.OWNER, Role.MODERATOR)
    list(@Query() q: any) {
        return this.discovery.staffList(q || {});
    }

    @Get(':id')
    @Roles(Role.ADMIN, Role.OWNER, Role.MODERATOR)
    one(@Param('id') id: string) {
        return this.discovery.staffGet(id);
    }

    /** Search again: { ids: [...] } (one or many, at most 200). */
    @Post('retry')
    @Roles(Role.ADMIN, Role.OWNER, Role.MODERATOR)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    retry(@Request() req, @Body() body: { ids?: unknown }) {
        const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
        if (!ids.length) throw new BadRequestException('Choose at least one product.');
        return this.discovery.staffRetry({ id: req.user.sub, role: String(req.user.role || '').toUpperCase() }, ids as string[]);
    }

    /** Use a found photo ({ url }), optionally with more exact-match photos for the gallery ({ also: [url] }). Atlantis Catalog only. */
    @Post(':id/accept')
    @Roles(Role.ADMIN, Role.OWNER)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    accept(@Request() req, @Param('id') id: string, @Body() body: { url?: unknown; also?: unknown }) {
        if (typeof body?.url !== 'string' || !body.url) throw new BadRequestException('Choose a photo.');
        const also = Array.isArray(body.also) ? body.also.filter((x): x is string => typeof x === 'string') : [];
        return this.discovery.staffAccept({ id: req.user.sub, role: String(req.user.role || '').toUpperCase() }, id, body.url, also);
    }

    /** "Not this product": one photo ({ url }) or all of them. Atlantis Catalog only. */
    @Post(':id/dismiss')
    @Roles(Role.ADMIN, Role.OWNER)
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    dismiss(@Param('id') id: string, @Body() body: { url?: unknown }) {
        return this.discovery.staffDismiss(id, typeof body?.url === 'string' ? body.url : undefined).then((state) => ({ state }));
    }
}
