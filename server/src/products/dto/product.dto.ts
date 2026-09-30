import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({
    example: 'ເສື້ອ 4B Digital Week',
    description: 'ຊື່ສິນຄ້າທີ່ຈະສະແດງໃນ POS',
  })
  name: string;

  @ApiProperty({
    example: 'TSHIRT-4B-001',
    description: 'SKU ຕ້ອງບໍ່ຊ້ຳກັນ',
  })
  sku: string;

  @ApiProperty({
    example: 99000,
    description: 'ລາຄາພື້ນຖານ ຫນ່ວຍ LAK',
  })
  basePrice: number;

  @ApiProperty({
    example: 'souvenir',
    description: 'ປະເພດສິນຄ້າ',
  })
  category: string;

  @ApiPropertyOptional({
    example: 'https://placehold.co/600x400?text=4B+Product',
    description: 'URL ຮູບສິນຄ້າ ໃຊ້ສະແດງໃນ admin ແລະ POS',
  })
  imageUrl?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'ເສື້ອ 4B Digital Week' })
  name?: string;

  @ApiPropertyOptional({ example: 'TSHIRT-4B-001' })
  sku?: string;

  @ApiPropertyOptional({ example: 99000 })
  basePrice?: number;

  @ApiPropertyOptional({ example: 'souvenir' })
  category?: string;

  @ApiPropertyOptional({ example: 'https://placehold.co/600x400?text=4B+Product' })
  imageUrl?: string;
}
