import { IsEmail, ArrayNotEmpty } from 'class-validator';

export class QuickVerifyDto {
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails: string[];
}
