import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { ClearSessionDto, SetModeDto } from './dto/session.dto';

@ApiTags('Session')
@Controller('session')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('set-mode')
  @ApiOperation({
    summary: 'Set RFID/POS device mode',
    description: [
      'ຕັ້ງ mode ໃຫ້ deviceId ກ່ອນ RFID hub ຍິງ /tags/capture.',
      'ຕົວຢ່າງ test checkout: deviceId = RPi-POS-01, mode = CHECKOUT.',
      'ຕົວຢ່າງ register tag ເຂົ້າສິນຄ້າ: mode = ADD ແລະໃສ່ productId.',
    ].join('\n'),
  })
  @ApiBody({ type: SetModeDto })
  @ApiResponse({
    status: 201,
    description: 'Updated or created device session.',
    schema: {
      example: {
        deviceId: 'RPi-POS-01',
        currentMode: 'CHECKOUT',
        activeProductId: null,
        lastScanData: [],
      },
    },
  })
  async setMode(
    @Body() data: SetModeDto,
  ) {
    return this.sessionsService.setMode(data.deviceId, data.mode, data.productId);
  }

  @Post('clear')
  @ApiOperation({
    summary: 'Clear device basket/session scan data',
    description: 'ລ້າງ lastScanData ຂອງ deviceId ແລະ emit empty basket ໄປຫາ POS frontend.',
  })
  @ApiBody({ type: ClearSessionDto })
  @ApiResponse({ status: 201, description: 'Session cleared.', schema: { example: { message: 'Session cleared' } } })
  async clear(@Body() data: ClearSessionDto) {
    return this.sessionsService.clearSession(data.deviceId);
  }

  @Get(':deviceId/snapshot')
  @ApiOperation({
    summary: 'Get current device basket snapshot',
    description: 'ດຶງສະຖານະກະຕ່າລ່າສຸດ ໃຊ້ເມື່ອ POS reload ຫຼື socket reconnect.',
  })
  @ApiParam({ name: 'deviceId', example: 'RPi-POS-01' })
  @ApiResponse({ status: 200, description: 'Current session snapshot.' })
  async snapshot(@Param('deviceId') deviceId: string) {
    return this.sessionsService.getSnapshot(deviceId);
  }
}
