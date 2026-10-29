import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { COUNTRY_NAMES, DEFAULT_DELIVERY_COUNTRIES, DELIVERY_COUNTRIES_KEY, checkDestination, countryName, loadDeliveryCountries, parseCountryList } from './delivery-policy';

/** Public: where Ali FMCG delivers, and a per-destination check for checkout. */
@Controller('shipping')
export class DeliveryPolicyController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('destinations')
    async destinations() {
        const { countries } = await loadDeliveryCountries(this.prisma);
        const allowed = new Set(countries);
        return {
            countries: Object.keys(COUNTRY_NAMES).map((code) => ({ code, name: countryName(code), supported: allowed.has(code) })).sort((a, b) => a.name.localeCompare(b.name)),
            note: 'Delivery is available to the countries marked as supported. Freight is quoted by Ali FMCG after the order is confirmed.',
        };
    }

    @Post('check-destination')
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    async check(@Body() body: { country?: string }) {
        const { countries } = await loadDeliveryCountries(this.prisma);
        return checkDestination(body?.country, countries);
    }
}

/** Admin: view and change the delivery country list. */
@Controller('admin/delivery-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class AdminDeliveryPolicyController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    async get() {
        const { countries, configured } = await loadDeliveryCountries(this.prisma);
        return { countries, configured, defaultCountries: [...DEFAULT_DELIVERY_COUNTRIES].sort(), all: Object.keys(COUNTRY_NAMES).map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)) };
    }

    @Put()
    async set(@Body() body: { countries?: unknown }) {
        let list: string[];
        try { list = parseCountryList(body?.countries); } catch (e: any) { throw new BadRequestException(e.message); }
        if (!list.length) throw new BadRequestException('Keep at least one delivery country — otherwise no order can be placed.');
        await this.prisma.appConfig.upsert({ where: { key: DELIVERY_COUNTRIES_KEY }, update: { value: JSON.stringify(list) }, create: { key: DELIVERY_COUNTRIES_KEY, value: JSON.stringify(list) } });
        return { countries: list, configured: true };
    }
}
