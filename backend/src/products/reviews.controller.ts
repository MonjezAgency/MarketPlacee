import { Controller, Post, Get, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { ReviewsService } from './reviews.service';

@Controller('products/:productId/reviews')
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) {}

    @Get()
    async findAll(@Param('productId') productId: string) {
        return this.reviewsService.findAll(productId);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    async create(
        @Param('productId') productId: string,
        @Request() req,
        @Body() body: { rating: number; comment?: string },
    ) {
        return this.reviewsService.create(productId, req.user.sub, body.rating, body.comment);
    }

    @Delete(':reviewId')
    @UseGuards(JwtAuthGuard)
    async delete(
        @Param('productId') productId: string,
        @Param('reviewId') reviewId: string,
        @Request() req,
    ) {
        return this.reviewsService.delete(reviewId, req.user.sub);
    }
}

/** Separate admin controller for reviews management */
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
export class AdminReviewsController {
    constructor(private readonly reviewsService: ReviewsService) {}

    @Get()
    findAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('maxRating') maxRating?: string,
    ) {
        return this.reviewsService.findAllAdmin(
            parseInt(page || '1', 10),
            parseInt(limit || '30', 10),
            maxRating ? parseInt(maxRating, 10) : undefined,
        );
    }

    @Delete(':reviewId')
    adminDelete(@Param('reviewId') reviewId: string) {
        return this.reviewsService.adminDelete(reviewId);
    }
}
