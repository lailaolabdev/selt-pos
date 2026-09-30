import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { PHAJAY_QR_BANKS } from './dto/payment.dto';
import { Model } from 'mongoose';
import { SessionsService } from '../sessions/sessions.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { TagsService } from '../tags/tags.service';
import {
  PaymentStatus,
  PaymentTransaction,
} from './schemas/payment-transaction.schema';

interface PhaJayPaymentLinkResponse {
  message?: string;
  redirectURL?: string;
  orderNo?: string;
}

interface PhaJayQrResponse {
  message?: string;
  transactionId?: string;
  qrCode?: string;
  link?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(PaymentTransaction.name)
    private readonly paymentModel: Model<PaymentTransaction>,
    private readonly sessionsService: SessionsService,
    private readonly gateway: SessionsGateway,
    private readonly tagsService: TagsService,
  ) {}

  async createPhaJayPaymentLink(deviceId: string) {
    const snapshot = await this.sessionsService.getSnapshot(deviceId);
    const amount = Number(snapshot.result?.totalPrice || 0);
    const tagIds: string[] = Array.isArray(snapshot.result?.tagIds)
      ? snapshot.result.tagIds
      : [];
    const items: Record<string, any>[] = Array.isArray(snapshot.result?.items)
      ? snapshot.result.items
      : [];

    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    if (amount <= 0 || tagIds.length === 0) {
      throw new BadRequestException(
        'Checkout basket is empty or not ready for payment',
      );
    }

    const orderNo = this.createOrderNo();
    const description = `4B-easy-POS ${orderNo}`;
    const payment = await new this.paymentModel({
      orderNo,
      deviceId,
      amount,
      description,
      items,
      tagIds,
      status: PaymentStatus.WAITING,
    }).save();

    const response = await this.requestPhaJayPaymentLink({
      orderNo,
      amount,
      description,
      tag1: deviceId,
      tag2: String(payment._id),
    });

    if (!response.redirectURL) {
      await this.paymentModel.findByIdAndUpdate(payment._id, {
        status: PaymentStatus.FAILED,
        $push: { webhookPayloads: { type: 'create-link-error', response } },
      });
      throw new InternalServerErrorException(
        'PhaJay did not return redirectURL',
      );
    }

    payment.redirectURL = response.redirectURL;
    payment.linkCode =
      this.getQueryParam(response.redirectURL, 'linkCode') || payment.linkCode;
    await payment.save();

    return {
      paymentId: String(payment._id),
      orderNo,
      amount,
      status: payment.status,
      redirectURL: response.redirectURL,
    };
  }

  async createPhaJayQrPayment(deviceId: string, selectedBank?: unknown) {
    const bank = this.getQrBank(selectedBank);
    const snapshot = await this.sessionsService.getSnapshot(deviceId);
    const amount = Number(snapshot.result?.totalPrice || 0);
    const tagIds: string[] = Array.isArray(snapshot.result?.tagIds)
      ? snapshot.result.tagIds
      : [];
    const items: Record<string, any>[] = Array.isArray(snapshot.result?.items)
      ? snapshot.result.items
      : [];

    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    if (amount <= 0 || tagIds.length === 0) {
      throw new BadRequestException(
        'Checkout basket is empty or not ready for payment',
      );
    }

    const orderNo = this.createOrderNo();
    const description = `4B POS ${orderNo}`;
    const payment = await new this.paymentModel({
      orderNo,
      deviceId,
      amount,
      description,
      items,
      tagIds,
      bank,
      status: PaymentStatus.WAITING,
    }).save();

    let response: PhaJayQrResponse;
    try {
      response = await this.requestPhaJayQr({
        bank,
        orderNo,
        amount,
        description,
        tag1: deviceId,
        tag2: String(payment._id),
        tag3: orderNo,
      });
    } catch (error) {
      await this.paymentModel.findByIdAndUpdate(payment._id, {
        status: PaymentStatus.FAILED,
      });
      throw error;
    }

    if (
      typeof response.qrCode !== 'string' ||
      !response.qrCode.trim() ||
      !response.transactionId
    ) {
      await this.paymentModel.findByIdAndUpdate(payment._id, {
        status: PaymentStatus.FAILED,
        $push: { webhookPayloads: { type: 'create-qr-error', response } },
      });
      throw new InternalServerErrorException('PhaJay did not return qrCode');
    }

    payment.qrCode = response.qrCode;
    payment.paymentLink = response.link;
    payment.providerTransactionId = response.transactionId;
    await payment.save();

    return {
      paymentId: String(payment._id),
      orderNo,
      amount,
      status: payment.status,
      bank,
      qrCode: response.qrCode,
      link: response.link,
      transactionId: response.transactionId,
    };
  }

  async getStatus(paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId).lean();
    if (!payment) {
      throw new BadRequestException('Payment transaction not found');
    }

    return {
      paymentId: String(payment._id),
      orderNo: payment.orderNo,
      amount: payment.amount,
      status: payment.status,
      redirectURL: payment.redirectURL,
      qrCode: payment.qrCode,
      link: payment.paymentLink,
      bank: payment.bank,
      paidAt: payment.paidAt,
      paymentMethod: payment.paymentMethod,
    };
  }

  async cancelPayment(paymentId: string, deviceId: string) {
    if (!/^[a-f0-9]{24}$/i.test(paymentId) || !deviceId) {
      throw new BadRequestException('Invalid payment cancellation request');
    }
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment || payment.deviceId !== deviceId) {
      throw new BadRequestException('Payment transaction not found');
    }
    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Paid payment cannot be cancelled');
    }
    if (payment.status !== PaymentStatus.CANCELLED) {
      payment.status = PaymentStatus.CANCELLED;
      await payment.save();
      this.emitPaymentUpdate(payment);
    }
    return {
      paymentId: String(payment._id),
      orderNo: payment.orderNo,
      amount: payment.amount,
      status: payment.status,
    };
  }

  async getReceipt(paymentId: string) {
    if (!/^[a-f0-9]{24}$/i.test(paymentId)) {
      throw new BadRequestException('Invalid payment id');
    }
    const payment = await this.paymentModel.findById(paymentId).lean();
    if (!payment || payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Receipt is only available for paid transactions',
      );
    }
    return {
      paymentId: String(payment._id),
      orderNo: payment.orderNo,
      deviceId: payment.deviceId,
      amount: payment.amount,
      currency: 'LAK',
      status: payment.status,
      paidAt: payment.paidAt,
      paymentMethod: payment.paymentMethod || 'PhaJay',
      items: payment.items.map((item) => ({
        name: String(item.name),
        count: Number(item.count),
        subtotal: Number(item.subtotal),
      })),
    };
  }

  async handlePhaJayWebhook(payload: Record<string, any>) {
    const orderNo = this.toOptionalString(payload.orderNo);
    const linkCode = this.toOptionalString(payload.linkCode);
    const providerTransactionId = this.toOptionalString(payload.transactionId);
    const providerStatus = this.toOptionalString(payload.status);
    const payment = await this.findPaymentForWebhook(
      orderNo,
      linkCode,
      providerTransactionId,
    );

    if (!payment) {
      return { message: 'PAYMENT_NOT_FOUND' };
    }

    payment.webhookPayloads = [...(payment.webhookPayloads || []), payload];
    payment.linkCode = linkCode || payment.linkCode;
    payment.providerTransactionId =
      providerTransactionId || payment.providerTransactionId;
    payment.paymentMethod =
      this.toOptionalString(payload.paymentMethod) || payment.paymentMethod;

    if (
      providerStatus === 'PAYMENT_COMPLETED' &&
      payment.status !== PaymentStatus.PAID
    ) {
      const paidAmount = Number(payload.txnAmount ?? payload.amount ?? 0);
      if (!Number.isFinite(paidAmount) || paidAmount !== payment.amount) {
        payment.status = PaymentStatus.FAILED;
        await payment.save();
        this.emitPaymentUpdate(payment);
        return { message: 'AMOUNT_MISMATCH' };
      }

      payment.status = PaymentStatus.PAID;
      payment.paidAt = new Date();
      await this.tagsService.confirmSale(String(payment._id), payment.tagIds);
      await this.sessionsService.clearSession(payment.deviceId);
    } else if (
      ['PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'FAILED', 'CANCELLED'].includes(
        providerStatus || '',
      ) &&
      payment.status === PaymentStatus.WAITING
    ) {
      payment.status = PaymentStatus.FAILED;
    }

    await payment.save();
    this.emitPaymentUpdate(payment);
    return { message: 'OK' };
  }

  private async requestPhaJayPaymentLink(body: {
    orderNo: string;
    amount: number;
    description: string;
    tag1: string;
    tag2: string;
  }): Promise<PhaJayPaymentLinkResponse> {
    const secretKey =
      process.env.PHAJAY_SECRET_KEY || process.env.PHAJAY_TEST_KEY;
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'PhaJay secret key is not configured',
      );
    }

    const baseUrl =
      process.env.PHAJAY_BASE_URL || 'https://payment-gateway.phajay.co';
    const mode = process.env.PHAJAY_PAYMENT_MODE || 'sandbox';
    const defaultPath =
      mode === 'production'
        ? '/v1/api/link/payment-link'
        : '/v1/api/test/payment/get-payment-link';
    const path = process.env.PHAJAY_PAYMENT_LINK_PATH || defaultPath;
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(secretKey).toString('base64')}`,
      },
      body: JSON.stringify(body),
    });

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'PhaJay payment link request failed',
        statusCode: response.status,
        data,
      });
    }

    return (
      data && typeof data === 'object' ? data : {}
    ) as PhaJayPaymentLinkResponse;
  }

  private async requestPhaJayQr(body: {
    bank: string;
    orderNo: string;
    amount: number;
    description: string;
    tag1: string;
    tag2: string;
    tag3: string;
  }): Promise<PhaJayQrResponse> {
    const secretKey = process.env.PHAJAY_SECRET_KEY?.trim();
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'PhaJay production secret key is not configured',
      );
    }
    const url = `https://payment-gateway.phajay.co/v1/api/payment/generate-${body.bank}-qr`;
    const { bank, ...payload } = body;
    void bank;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        secretKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'PhaJay QR request failed',
        statusCode: response.status,
        data,
      });
    }

    return (data && typeof data === 'object' ? data : {}) as PhaJayQrResponse;
  }

  private async findPaymentForWebhook(
    orderNo?: string,
    linkCode?: string,
    transactionId?: string,
  ) {
    if (orderNo) {
      const payment = await this.paymentModel.findOne({ orderNo });
      if (payment) return payment;
    }

    if (linkCode) {
      const payment = await this.paymentModel.findOne({ linkCode });
      if (payment) return payment;
    }

    if (transactionId) {
      return this.paymentModel.findOne({
        $or: [
          { providerTransactionId: transactionId },
          { linkCode: transactionId },
        ],
      });
    }

    return null;
  }

  private createOrderNo() {
    return `POS${Date.now()}${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private getQrBank(selectedBank?: unknown) {
    const value = selectedBank ?? process.env.PHAJAY_QR_BANK ?? 'bcel';
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid PhaJay QR bank');
    }
    const bank = value.trim().toLowerCase();
    if (!(PHAJAY_QR_BANKS as readonly string[]).includes(bank)) {
      throw new BadRequestException(
        `bank must be one of ${PHAJAY_QR_BANKS.join(', ')}`,
      );
    }
    return bank;
  }

  private getQueryParam(url: string, key: string) {
    try {
      return new URL(url).searchParams.get(key) || undefined;
    } catch {
      return undefined;
    }
  }

  private toOptionalString(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined;
  }

  private emitPaymentUpdate(payment: PaymentTransaction) {
    this.gateway.emitPaymentUpdate(payment.deviceId, {
      paymentId: String(payment._id),
      orderNo: payment.orderNo,
      amount: payment.amount,
      status: payment.status,
      paidAt: payment.paidAt,
      paymentMethod: payment.paymentMethod,
    });
  }
}
