import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  orderId: string;
}
