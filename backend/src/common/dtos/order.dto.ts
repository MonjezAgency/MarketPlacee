import { Expose, Exclude, Transform } from 'class-transformer';

export class OrderDto {
    @Expose()
    id: string;

    @Expose()
    totalAmount: number;

    @Expose()
    status: string;

    @Expose()
    shippingCompany: string;

    @Expose()
    customerShippingCompany: string;

    @Expose()
    shippingCost: number;

    @Expose()
    supplierInvoiceUrl: string;

    @Expose()
    @Transform(({ value, obj }) => {
        // Basic email masking: user@example.com -> u***@example.com
        if (!value) return value;
        const [name, domain] = value.split('@');
        return `${name[0]}***@${domain}`;
    })
    customerEmail: string;

    @Expose()
    createdAt: Date;
}
