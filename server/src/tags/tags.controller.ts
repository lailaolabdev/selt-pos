import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { TagsService } from './tags.service';
import { SessionsService } from '../sessions/sessions.service';
import { CaptureTagsDto, ConfirmSaleDto, SyncTagsDto } from './dto/tags.dto';

@ApiTags('RFID Hub')
@Controller('tags')
export class TagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Post('capture')
  @ApiOperation({
    summary: 'RFID hub capture',
    description: [
      'Endpoint ຫຼັກທີ່ RFID hub ໃຊ້ສົ່ງ tagIds ມາ server.',
      'Server ຈະເບິ່ງ session mode ຂອງ deviceId ກ່ອນ:',
      '- IDLE: ຮັບແຕ່ບໍ່ຄິດໄລ່',
      '- ADD: ຜູກ tagIds ເຂົ້າ productId ທີ່ active ໃນ session',
      '- CHECK: ກວດວ່າ tag ຮູ້ຈັກ ຫຼື unknown',
      '- CHECKOUT: ຄິດໄລ່ລາຍການສິນຄ້າ ແລະ totalPrice',
      '',
      'ການທົດສອບໃນ Swagger: ໃຫ້ POST /session/set-mode ເປັນ CHECKOUT ກ່ອນ, ແລ້ວຍິງ endpoint ນີ້.',
    ].join('\n'),
  })
  @ApiBody({ type: CaptureTagsDto })
  @ApiResponse({
    status: 201,
    description: 'Result depends on current device session mode.',
    schema: {
      example: {
        transactionId: '66f0c2d4b7f1c9a001234999',
        items: [
          {
            name: 'ເສື້ອ 4B Digital Week',
            imageUrl: 'https://placehold.co/600x400?text=4B+Product',
            count: 2,
            subtotal: 198000,
          },
        ],
        totalPrice: 198000,
        tagIds: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
      },
    },
  })
  async capture(
    @Body() data: CaptureTagsDto,
  ) {
    return this.sessionsService.handleCapture(data.deviceId, data.tagIds, data.status);
  }

  @Post('dev/capture-product')
  @ApiOperation({
    summary: 'Development-only simulated RFID scan',
    description: 'Adds one generated DEV tag for a product and feeds it through the normal capture flow. Requires ENV=dev.',
  })
  async captureDevProduct(@Body() data: { deviceId: string; productId: string }) {
    return this.sessionsService.simulateDevProduct(data.deviceId, data.productId);
  }

  @Post('sync')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({
    summary: 'Manual RFID tag sync',
    description: 'Endpoint ສຳລັບ test/admin sync tags ໂດຍບໍ່ຕ້ອງໃຊ້ session mode. RFID hub flow ຫຼັກແນະນຳໃຊ້ /tags/capture.',
  })
  @ApiBody({ type: SyncTagsDto })
  @ApiResponse({ status: 201, description: 'Sync result.' })
  async sync(
    @Body() data: SyncTagsDto,
  ) {
    return this.tagsService.sync(data);
  }

  @Post('check-duplicates')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  async checkDuplicates(@Body() data: { tagIds?: string[] }) {
    return { duplicates: await this.tagsService.findExistingTagIds(data.tagIds || []) };
  }

  @Patch('confirm-sale')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({
    summary: 'Confirm sale',
    description: 'Mark RFID tags ຈາກ checkout ໃຫ້ເປັນ sold. ຄວນເອີ້ນຫຼັງຈາກ payment success.',
  })
  @ApiBody({ type: ConfirmSaleDto })
  @ApiResponse({
    status: 200,
    description: 'Sale confirmation result.',
    schema: { example: { message: 'Sale confirmed', updatedCount: 2 } },
  })
  async confirmSale(@Body() data: ConfirmSaleDto) {
    return this.tagsService.confirmSale(data.transactionId, data.tagIds);
  }

  @Get('product/:productId')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({ summary: 'Find tags by product id' })
  @ApiParam({ name: 'productId', example: '66f0c2d4b7f1c9a001234567', description: 'MongoDB product _id.' })
  @ApiResponse({ status: 200, description: 'RFID tags linked to product.' })
  async findByProductId(@Param('productId') productId: string) {
    return this.tagsService.findByProductId(productId);
  }
}

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly tagsService: TagsService) {}

  @Get('summary')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({
    summary: 'Inventory summary',
    description: 'ສະຫຼຸບ stock ທີ່ status = available ໂດຍ group ຕາມ product.',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory summary grouped by product.',
    schema: {
      example: [
        {
          productId: '66f0c2d4b7f1c9a001234567',
          name: 'ເສື້ອ 4B Digital Week',
          sku: 'TSHIRT-4B-001',
          availableCount: 25,
        },
      ],
    },
  })
  async getSummary() {
    return this.tagsService.getInventorySummary();
  }
}
