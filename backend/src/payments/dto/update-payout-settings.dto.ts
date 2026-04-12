import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

export class UpdatePayoutSettingsDto {
    @IsString()
    @IsNotEmpty()
    accountHolderName: string;

    @IsString()
    @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}$/, { message: 'Invalid IBAN format' })
    iban: string;

    @IsString()
    @Matches(/^[A-Z]{6}[A-Z0-9]{2,5}$/, { message: 'Invalid SWIFT/BIC code' })
    swiftCode: string;

    @IsString()
    @IsNotEmpty()
    bankName: string;

    @IsString()
    @Length(2, 2)
    countryCode: string;

    @IsString()
    @IsNotEmpty()
    vatNumber: string;
}
