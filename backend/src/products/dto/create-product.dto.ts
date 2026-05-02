import { IsString, IsNumber, IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class CreateProductDto {
    @IsString()
    name!: string;

    @IsString()
    description!: string;

    @IsOptional()
    @IsString()
    brand?: string;

    @IsNumber()
    @Min(0)
    price!: number;

    @IsNumber()
    @Min(0)
    stock!: number;

    @IsString()
    category!: string;

    @IsOptional()
    @IsString({ each: true })
    images?: string[];

    @IsOptional()
    @IsString()
    ean?: string;

    @IsOptional()
    variants?: any;

    @IsOptional()
    @IsEnum(ProductStatus)
    status?: ProductStatus;

    @IsOptional()
    @IsString()
    adminNotes?: string;

    @IsOptional()
    @IsString()
    supplierId?: string;

    @IsOptional()
    @IsString()
    unit?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    moq?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    unitsPerCase?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    casesPerPallet?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    unitsPerPallet?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    palletsPerShipment?: number;

    @IsOptional()
    @IsString()
    shelfLife?: string;

    @IsOptional()
    @IsString()
    warehouseId?: string;

    @IsOptional()
    readyForDispatch?: boolean;

    @IsOptional()
    @IsInt()
    leadTime?: number;
}


