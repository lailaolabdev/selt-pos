import {
  BadRequestException,
  Logger,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PHAJAY_QR_BANKS } from './dto/payment.dto';
import { Model } from 'mongoose';
import { SessionsService } from '../sessions/sessions.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { TagsService } from '../tags/tags.service';
import {
  PaymentStatus,
  PaymentTransaction,
  PaymentProvider,
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

interface BioIntentResponse {
  data?: { intentId?: string; expiresInSeconds?: number };
  error?: { message?: string };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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

  async createBioPaymentIntent(deviceId: string) {
    const snapshot = await this.sessionsService.getSnapshot(deviceId);
    const amount = Number(snapshot.result?.totalPrice || 0);
    const tagIds: string[] = Array.isArray(snapshot.result?.tagIds) ? snapshot.result.tagIds : [];
    const items: Record<string, unknown>[] = Array.isArray(snapshot.result?.items)
      ? snapshot.result.items as Record<string, unknown>[] : [];
    if (!deviceId) throw new BadRequestException('deviceId is required');
    if (!Number.isSafeInteger(amount) || amount <= 0 || tagIds.length === 0) {
      throw new BadRequestException('Checkout basket is empty or not ready for payment');
    }

    const orderNo = this.createOrderNo();
    const payment = await new this.paymentModel({
      orderNo, deviceId, amount, description: `4B-easy-POS BIO ${orderNo}`,
      items, tagIds, provider: PaymentProvider.BIO, status: PaymentStatus.WAITING,
    }).save();
    try {
      const response = await this.requestBioIntent({ amount, orderNo, deviceId });
      const intentId = response.data?.intentId;
      if (!intentId) throw new InternalServerErrorException(response.error?.message || 'Bio Payment did not return intentId');
      const expiresInSeconds = Number(response.data?.expiresInSeconds || 300);
      payment.providerIntentId = intentId;
      payment.providerTransactionId = intentId;
      payment.expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      await payment.save();
      return { paymentId: String(payment._id), orderNo, amount, status: payment.status, provider: PaymentProvider.BIO, intentId, expiresInSeconds };
    } catch (error) {
      payment.status = PaymentStatus.FAILED;
      await payment.save();
      throw error;
    }
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

  async handlePhaJayWebhook(
    payload: Record<string, any>,
    meta?: {
      rawBody?: Buffer;
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
    },
  ) {
    const receivedAt = new Date().toISOString();
    const safeHeaders = Object.fromEntries(
      Object.entries(meta?.headers || {})
        .filter(([name]) => !['authorization', 'cookie', 'x-api-key'].includes(name.toLowerCase()))
        .map(([name, value]) => [name, value]),
    );
    this.logger.log(
      `[PhaJayWebhook] RECEIVED ${JSON.stringify({
        receivedAt,
        ip: meta?.ip,
        headers: safeHeaders,
        payload,
        rawBody: meta?.rawBody?.toString('utf8'),
      })}`,
    );

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
      this.logger.warn(
        `[PhaJayWebhook] PAYMENT_NOT_FOUND ${JSON.stringify({ orderNo, linkCode, transactionId: providerTransactionId, status: providerStatus })}`,
      );
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
        this.logger.warn(
          `[PhaJayWebhook] AMOUNT_MISMATCH ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, expected: payment.amount, received: paidAmount, payload })}`,
        );
        payment.status = PaymentStatus.FAILED;
        await payment.save();
        this.emitPaymentUpdate(payment);
        return { message: 'AMOUNT_MISMATCH' };
      }

      payment.status = PaymentStatus.PAID;
      payment.paidAt = new Date();
      this.logger.log(
        `[PhaJayWebhook] PAYMENT_COMPLETED ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, amount: paidAmount, transactionId: providerTransactionId })}`,
      );
      // Demo mode: payment must not consume RFID stock. Keep the tag linked
      // to its product so the same tag can be scanned again during demos.
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
    this.logger.log(
      `[PhaJayWebhook] PROCESSED ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, providerStatus, localStatus: payment.status })}`,
    );
    return { message: 'OK' };
  }

  async handleBioWebhook(payload: Record<string, unknown>, rawBody: Buffer | undefined, signature?: string) {
    const demoMode = process.env.BIO_DEMO_MODE?.trim().toLowerCase() === 'true';
    if (!demoMode) {
      const secret = process.env.BIO_WEBHOOK_SECRET?.trim();
      if (!secret) throw new ServiceUnavailableException('BIO_WEBHOOK_SECRET is not configured');
      if (!rawBody || !signature) throw new BadRequestException('Invalid Bio Payment webhook signature');
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      const actual = Buffer.from(signature.trim(), 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');
      if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
        throw new BadRequestException('Invalid Bio Payment webhook signature');
      }
    }
    const orderNo = this.toOptionalString(payload.orderNo);
    const transactionId = this.toOptionalString(payload.transactionId);
    const paidAmount = Number(payload.amount ?? payload.txnAmount);
    let payment = await this.findPaymentForWebhook(orderNo, undefined, transactionId);
    if (!payment && demoMode && Number.isFinite(paidAmount)) {
      payment = await this.paymentModel.findOne({
        provider: PaymentProvider.BIO,
        status: PaymentStatus.WAITING,
        amount: paidAmount,
      });
    }
    if (!payment) return { message: 'PAYMENT_NOT_FOUND' };
    payment.webhookPayloads = [...(payment.webhookPayloads || []), payload];
    payment.provider = PaymentProvider.BIO;
    payment.providerTransactionId = transactionId || payment.providerTransactionId;
    const currency = this.toOptionalString(payload.currency);
    const idFromProvider = this.toOptionalString(payload.deviceId) || this.toOptionalString(payload.terminalId);
    const idMatches = Boolean(
      idFromProvider &&
      [payment.deviceId, process.env.BIO_DEVICE_ID?.trim()].includes(idFromProvider),
    );
    const amountMatches = Number.isFinite(paidAmount) && paidAmount === payment.amount;
    const validPayment = demoMode
      ? idMatches || amountMatches
      : payload.event === 'palm_payment.succeeded' && currency === 'LAK' && amountMatches;
    if (!validPayment) return { message: 'IGNORED' };
    if (payment.status !== PaymentStatus.PAID) {
      payment.status = PaymentStatus.PAID;
      payment.paidAt = payload.paidAt ? new Date(String(payload.paidAt)) : new Date();
      await this.sessionsService.clearSession(payment.deviceId);
      await payment.save();
      this.emitPaymentUpdate(payment);
    } else {
      await payment.save();
    }
    return { message: 'OK' };
  }

  private async requestBioIntent(body: { amount: number; orderNo: string; deviceId: string }) {
    const baseUrl = (process.env.BIO_PAYMENT_BASE_URL || 'https://bio-payment-api.phajay.co').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    headers['X-Device-Id'] = process.env.BIO_DEVICE_ID?.trim() || body.deviceId;
    const response = await fetch(`${baseUrl}/api/v1/palm/payment-intents`, {
      method: 'POST', headers,
      body: JSON.stringify({ amount: body.amount, currency: 'LAK', orderNo: body.orderNo }),
      signal: AbortSignal.timeout(15000),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new ServiceUnavailableException({ message: 'Bio Payment intent request failed', statusCode: response.status, data });
    return (data && typeof data === 'object' ? data : {}) as BioIntentResponse;
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
    const mode = (process.env.PHAJAY_PAYMENT_MODE || 'production').trim().toLowerCase();
    const sandbox = mode === 'sandbox' || mode === 'test';
    const secretKey = (sandbox
      ? process.env.PHAJAY_TEST_KEY || process.env.PHAJAY_SECRET_KEY
      : process.env.PHAJAY_SECRET_KEY
    )?.trim();
    if (!secretKey) {
      throw new ServiceUnavailableException(
        sandbox
          ? 'PhaJay test key is not configured'
          : 'PhaJay production secret key is not configured',
      );
    }
    const baseUrl = (process.env.PHAJAY_BASE_URL || 'https://payment-gateway.phajay.co').replace(/\/$/, '');
    const defaultPath = `/v1/api/${sandbox ? 'test/' : ''}payment/generate-${body.bank}-qr`;
    const configuredPath = process.env.PHAJAY_QR_PATH?.trim();
    const path = configuredPath
      ? configuredPath.replace('{bank}', body.bank)
      : defaultPath;
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
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
