import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePhaJayPaymentLinkDto {
  @ApiProperty({
    example: 'RPi-POS-01',
    description:
      'POS/RFID device id whose current checkout basket will be paid.',
  })
  deviceId: string;
}

export const PHAJAY_QR_BANKS = [
  'bcel',
  'jdb',
  'ldb',
  'ib',
  'stb',
  'm-money',
] as const;
export type PhaJayQrBank = (typeof PHAJAY_QR_BANKS)[number];

export class CreatePhaJayQrDto extends CreatePhaJayPaymentLinkDto {
  @ApiPropertyOptional({
    enum: PHAJAY_QR_BANKS,
    example: 'bcel',
    description: 'Bank selected on the POS payment screen.',
  })
  bank?: PhaJayQrBank;
}
