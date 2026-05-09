import { IsString, IsNumber, IsOptional, IsInt, Min, IsEnum, MinLength } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class CreateProductDto {
    @IsString()
    @MinLength(2, { message: 'Product name is required (at least 2 characters).' })
    name!: string;

    /**
     * Description is REQUIRED — even a one-liner. The supplier should
     * say something useful about the product (shelf life, packaging,
     * variant, anything). Importer rejects rows with empty descriptions
     * so the catalog never lists an empty product page.
     */
    @IsString()
    @MinLength(10, { message: 'Description is required — write at least one short sentence describing the product (shelf life, variant, packaging notes, etc.).' })
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


