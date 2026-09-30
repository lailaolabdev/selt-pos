import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ScannerStatusDto {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  STABLE = 'STABLE',
}

export enum TagSyncModeDto {
  ADD = 'add',
  CHECK = 'check',
  CHECKOUT = 'checkout',
  REPLACE = 'replace',
}

export class CaptureTagsDto {
  @ApiProperty({
    example: 'RPi-POS-01',
    description: 'ID ຂອງ RFID hub/reader. POS frontend ໃຊ້ deviceId ນີ້ເພື່ອ sync session.',
  })
  deviceId: string;

  @ApiProperty({
    example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
    description: 'RFID tag ids ທີ່ hub ອ່ານໄດ້ຈາກຕະກ້າປັດຈຸບັນ.',
    isArray: true,
    type: String,
  })
  tagIds: string[];

  @ApiPropertyOptional({
    enum: ScannerStatusDto,
    example: ScannerStatusDto.STABLE,
    description: 'ສະຖານະການອ່ານຈາກ hub. STABLE ໝາຍເຖິງອ່ານຈົບແລ້ວ.',
  })
  status?: ScannerStatusDto;
}

export class SyncTagsDto {
  @ApiProperty({ example: 'RPi-POS-01' })
  deviceId: string;

  @ApiProperty({
    example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
    description: 'ຮັບໄດ້ທັງ array ແລະ string ທີ່ຂັ້ນດ້ວຍ comma/space/newline.',
    isArray: true,
    type: String,
  })
  tagIds: string[];

  @ApiProperty({
    enum: TagSyncModeDto,
    example: TagSyncModeDto.CHECKOUT,
    description: 'add/register tag, check tag, checkout basket, ຫຼື replace tag ຂອງສິນຄ້າ.',
  })
  mode: TagSyncModeDto;

  @ApiPropertyOptional({
    example: '66f0c2d4b7f1c9a001234567',
    description: 'MongoDB product _id. ຈຳເປັນສຳລັບ mode add ແລະ replace.',
  })
  productId?: string;
}

export class ConfirmSaleDto {
  @ApiProperty({
    example: '66f0c2d4b7f1c9a001234999',
    description: 'transactionId ທີ່ໄດ້ຈາກ checkout response.',
  })
  transactionId: string;

  @ApiProperty({
    example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
    description: 'RFID tag ids ທີ່ຈະ mark ເປັນ sold.',
    isArray: true,
    type: String,
  })
  tagIds: string[];
}
