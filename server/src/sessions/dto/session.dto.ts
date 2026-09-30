import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceMode } from '../schemas/session.schema';

export class SetModeDto {
  @ApiProperty({
    example: 'RPi-POS-01',
    description: 'ID ຂອງ RFID hub/reader ຫຼື POS station.',
  })
  deviceId: string;

  @ApiProperty({
    enum: DeviceMode,
    example: DeviceMode.CHECKOUT,
    description: 'IDLE, ADD, CHECK, CHECKOUT. capture endpoint ຈະປະມວນຜົນຕາມ mode ນີ້.',
  })
  mode: DeviceMode;

  @ApiPropertyOptional({
    example: '66f0c2d4b7f1c9a001234567',
    description: 'product _id ທີ່ໃຊ້ເມື່ອ mode = ADD.',
  })
  productId?: string;
}

export class ClearSessionDto {
  @ApiProperty({
    example: 'RPi-POS-01',
    description: 'ID ຂອງ RFID hub/reader ຫຼື POS station ທີ່ຈະ clear basket.',
  })
  deviceId: string;
}
