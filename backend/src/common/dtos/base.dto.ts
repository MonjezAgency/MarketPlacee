import { Expose, Exclude, Type } from 'class-transformer';

export class UserDto {
    @Expose()
    id: string;

    @Expose()
    email: string;

    @Expose()
    name: string;

    @Expose()
    role: string;

    @Expose()
    status: string;

    @Expose()
    phone?: string;

    @Expose()
    avatar?: string;

    @Expose()
    companyName?: string;

    @Expose()
    website?: string;

    @Expose()
    socialLinks?: string;

    @Exclude()
    password?: string;

    @Exclude()
    verificationToken?: string;

    @Exclude()
    resetPasswordToken?: string;

    @Exclude()
    resetPasswordExpires?: Date;

    // Strict scrubbing for billing data - NEVER expose to frontend
    @Exclude()
    vatNumber?: string;

    @Exclude()
    taxId?: string;

    @Exclude()
    country?: string;

    @Exclude()
    bankAddress?: string;

    @Exclude()
    iban?: string;

    @Exclude()
    swiftCode?: string;

    @Expose()
    createdAt: Date;
}

export class ProductDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    description: string;

    @Expose()
    price: number;

    @Expose()
    stock: number;

    @Expose()
    category: string;

    @Expose()
    images: string[];

    // Surface supplierId so the public PDP can detect when the viewer is
    // the supplier-owner of the product and switch the tier ladder to
    // RAW prices (no markup). Hiding it caused supplier owners to see
    // customer prices (with markup) on every PDP, which is exactly the
    // spread-leak we wanted to prevent. The supplier name + branding
    // are already public on the PDP, so exposing the id is not new info.
    @Expose()
    supplierId: string;

    @Expose()
    createdAt: Date;
}
