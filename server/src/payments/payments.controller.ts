import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreatePhaJayPaymentLinkDto,
  CreatePhaJayQrDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments/phajay')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payment-link')
  @ApiOperation({
    summary: 'Create PhaJay Payment Link for the current POS basket',
    description:
      'Reads the current CHECKOUT snapshot for deviceId, creates a local payment transaction, and requests a PhaJay payment link.',
  })
  @ApiBody({ type: CreatePhaJayPaymentLinkDto })
  @ApiResponse({
    status: 201,
    description: 'PhaJay payment link created.',
    schema: {
      example: {
        paymentId: '66f0c2d4b7f1c9a001234999',
        orderNo: 'POS1756130000000A1B2C3',
        amount: 198000,
        status: 'WAITING',
        redirectURL:
          'https://payment-link-sandbox.netlify.app?amount=198000&linkCode=ABC123',
      },
    },
  })
  createPaymentLink(@Body() data: CreatePhaJayPaymentLinkDto) {
    return this.paymentsService.createPhaJayPaymentLink(data.deviceId);
  }

  @Post('qr')
  @ApiOperation({
    summary: 'Create PhaJay QR payment for the current POS basket',
    description:
      'Reads the current CHECKOUT snapshot for deviceId and requests a bank QR from PhaJay without redirecting the POS screen.',
  })
  @ApiBody({ type: CreatePhaJayQrDto })
  @ApiResponse({
    status: 201,
    description: 'PhaJay QR created.',
    schema: {
      example: {
        paymentId: '66f0c2d4b7f1c9a001234999',
        orderNo: 'POS1756130000000A1B2C3',
        amount: 198000,
        status: 'WAITING',
        bank: 'bcel',
        qrCode: '0002010102...',
        link: 'onepay://qr/...',
        transactionId: 'PJG...',
      },
    },
  })
  createQr(@Body() data: CreatePhaJayQrDto) {
    return this.paymentsService.createPhaJayQrPayment(data.deviceId, data.bank);
  }

  @Get(':paymentId/status')
  @ApiOperation({ summary: 'Get local PhaJay payment status' })
  @ApiParam({ name: 'paymentId', example: '66f0c2d4b7f1c9a001234999' })
  getStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getStatus(paymentId);
  }

  @Get(':paymentId/receipt')
  @ApiOperation({
    summary: 'Get immutable receipt data for a paid transaction',
  })
  getReceipt(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getReceipt(paymentId);
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'PhaJay webhook callback',
    description:
      'Configure this URL in PhaJay portal. On PAYMENT_COMPLETED it marks RFID tags as sold and clears the POS basket.',
  })
  handleWebhook(@Body() payload: Record<string, any>) {
    return this.paymentsService.handlePhaJayWebhook(payload);
  }
}
