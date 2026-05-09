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

    /** Unit the MOQ is counted in. Defaults to PIECE on the backend. */
    @IsOptional()
    @IsString()
    moqUnit?: 'PIECE' | 'CASE' | 'PALLET' | 'TRUCK' | string;

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
    weight?: string;

    @IsOptional()
    @IsString()
    origin?: string;

    /**
     * EXW (Ex Works) — where the goods physically sit today. Atlantis
     * logistics uses this to quote transport from origin warehouse to
     * the buyer. The Excel importer makes this practically required:
     * a row without an EXW value is held in PENDING with an explicit
     * "EXW required" admin note until the supplier provides it.
     */
    @IsOptional()
    @IsString()
    exwLocation?: string;

    @IsOptional()
    @IsString()
    warehouseId?: string;

    @IsOptional()
    readyForDispatch?: boolean;

    @IsOptional()
    @IsInt()
    leadTime?: number;
}


