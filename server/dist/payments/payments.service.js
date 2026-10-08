"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const node_crypto_1 = require("node:crypto");
const node_crypto_2 = require("node:crypto");
const payment_dto_1 = require("./dto/payment.dto");
const mongoose_2 = require("mongoose");
const sessions_service_1 = require("../sessions/sessions.service");
const sessions_gateway_1 = require("../sessions/sessions.gateway");
const tags_service_1 = require("../tags/tags.service");
const payment_transaction_schema_1 = require("./schemas/payment-transaction.schema");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    paymentModel;
    sessionsService;
    gateway;
    tagsService;
    logger = new common_1.Logger(PaymentsService_1.name);
    constructor(paymentModel, sessionsService, gateway, tagsService) {
        this.paymentModel = paymentModel;
        this.sessionsService = sessionsService;
        this.gateway = gateway;
        this.tagsService = tagsService;
    }
    async createPhaJayPaymentLink(deviceId) {
        const snapshot = await this.sessionsService.getSnapshot(deviceId);
        const amount = Number(snapshot.result?.totalPrice || 0);
        const tagIds = Array.isArray(snapshot.result?.tagIds)
            ? snapshot.result.tagIds
            : [];
        const items = Array.isArray(snapshot.result?.items)
            ? snapshot.result.items
            : [];
        if (!deviceId) {
            throw new common_1.BadRequestException('deviceId is required');
        }
        if (amount <= 0 || tagIds.length === 0) {
            throw new common_1.BadRequestException('Checkout basket is empty or not ready for payment');
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
            status: payment_transaction_schema_1.PaymentStatus.WAITING,
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
                status: payment_transaction_schema_1.PaymentStatus.FAILED,
                $push: { webhookPayloads: { type: 'create-link-error', response } },
            });
            throw new common_1.InternalServerErrorException('PhaJay did not return redirectURL');
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
    async createPhaJayQrPayment(deviceId, selectedBank) {
        const bank = this.getQrBank(selectedBank);
        const snapshot = await this.sessionsService.getSnapshot(deviceId);
        const amount = Number(snapshot.result?.totalPrice || 0);
        const tagIds = Array.isArray(snapshot.result?.tagIds)
            ? snapshot.result.tagIds
            : [];
        const items = Array.isArray(snapshot.result?.items)
            ? snapshot.result.items
            : [];
        if (!deviceId) {
            throw new common_1.BadRequestException('deviceId is required');
        }
        if (amount <= 0 || tagIds.length === 0) {
            throw new common_1.BadRequestException('Checkout basket is empty or not ready for payment');
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
            status: payment_transaction_schema_1.PaymentStatus.WAITING,
        }).save();
        let response;
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
        }
        catch (error) {
            await this.paymentModel.findByIdAndUpdate(payment._id, {
                status: payment_transaction_schema_1.PaymentStatus.FAILED,
            });
            throw error;
        }
        if (typeof response.qrCode !== 'string' ||
            !response.qrCode.trim() ||
            !response.transactionId) {
            await this.paymentModel.findByIdAndUpdate(payment._id, {
                status: payment_transaction_schema_1.PaymentStatus.FAILED,
                $push: { webhookPayloads: { type: 'create-qr-error', response } },
            });
            throw new common_1.InternalServerErrorException('PhaJay did not return qrCode');
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
    async createBioPaymentIntent(deviceId) {
        const snapshot = await this.sessionsService.getSnapshot(deviceId);
        const amount = Number(snapshot.result?.totalPrice || 0);
        const tagIds = Array.isArray(snapshot.result?.tagIds) ? snapshot.result.tagIds : [];
        const items = Array.isArray(snapshot.result?.items)
            ? snapshot.result.items : [];
        if (!deviceId)
            throw new common_1.BadRequestException('deviceId is required');
        if (!Number.isSafeInteger(amount) || amount <= 0 || tagIds.length === 0) {
            throw new common_1.BadRequestException('Checkout basket is empty or not ready for payment');
        }
        const orderNo = this.createOrderNo();
        const payment = await new this.paymentModel({
            orderNo, deviceId, amount, description: `4B-easy-POS BIO ${orderNo}`,
            items, tagIds, provider: payment_transaction_schema_1.PaymentProvider.BIO, status: payment_transaction_schema_1.PaymentStatus.WAITING,
        }).save();
        try {
            const response = await this.requestBioIntent({ amount, orderNo, deviceId });
            const intentId = response.data?.intentId;
            if (!intentId)
                throw new common_1.InternalServerErrorException(response.error?.message || 'Bio Payment did not return intentId');
            const expiresInSeconds = Number(response.data?.expiresInSeconds || 300);
            payment.providerIntentId = intentId;
            payment.providerTransactionId = intentId;
            payment.expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
            await payment.save();
            return { paymentId: String(payment._id), orderNo, amount, status: payment.status, provider: payment_transaction_schema_1.PaymentProvider.BIO, intentId, expiresInSeconds };
        }
        catch (error) {
            payment.status = payment_transaction_schema_1.PaymentStatus.FAILED;
            await payment.save();
            throw error;
        }
    }
    async getStatus(paymentId) {
        const payment = await this.paymentModel.findById(paymentId).lean();
        if (!payment) {
            throw new common_1.BadRequestException('Payment transaction not found');
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
    async cancelPayment(paymentId, deviceId) {
        if (!/^[a-f0-9]{24}$/i.test(paymentId) || !deviceId) {
            throw new common_1.BadRequestException('Invalid payment cancellation request');
        }
        const payment = await this.paymentModel.findById(paymentId);
        if (!payment || payment.deviceId !== deviceId) {
            throw new common_1.BadRequestException('Payment transaction not found');
        }
        if (payment.status === payment_transaction_schema_1.PaymentStatus.PAID) {
            throw new common_1.BadRequestException('Paid payment cannot be cancelled');
        }
        if (payment.status !== payment_transaction_schema_1.PaymentStatus.CANCELLED) {
            payment.status = payment_transaction_schema_1.PaymentStatus.CANCELLED;
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
    async getReceipt(paymentId) {
        if (!/^[a-f0-9]{24}$/i.test(paymentId)) {
            throw new common_1.BadRequestException('Invalid payment id');
        }
        const payment = await this.paymentModel.findById(paymentId).lean();
        if (!payment || payment.status !== payment_transaction_schema_1.PaymentStatus.PAID) {
            throw new common_1.BadRequestException('Receipt is only available for paid transactions');
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
    async handlePhaJayWebhook(payload, meta) {
        const receivedAt = new Date().toISOString();
        const safeHeaders = Object.fromEntries(Object.entries(meta?.headers || {})
            .filter(([name]) => !['authorization', 'cookie', 'x-api-key'].includes(name.toLowerCase()))
            .map(([name, value]) => [name, value]));
        this.logger.log(`[PhaJayWebhook] RECEIVED ${JSON.stringify({
            receivedAt,
            ip: meta?.ip,
            headers: safeHeaders,
            payload,
            rawBody: meta?.rawBody?.toString('utf8'),
        })}`);
        const orderNo = this.toOptionalString(payload.orderNo);
        const linkCode = this.toOptionalString(payload.linkCode);
        const providerTransactionId = this.toOptionalString(payload.transactionId);
        const providerStatus = this.toOptionalString(payload.status);
        const payment = await this.findPaymentForWebhook(orderNo, linkCode, providerTransactionId);
        if (!payment) {
            this.logger.warn(`[PhaJayWebhook] PAYMENT_NOT_FOUND ${JSON.stringify({ orderNo, linkCode, transactionId: providerTransactionId, status: providerStatus })}`);
            return { message: 'PAYMENT_NOT_FOUND' };
        }
        payment.webhookPayloads = [...(payment.webhookPayloads || []), payload];
        payment.linkCode = linkCode || payment.linkCode;
        payment.providerTransactionId =
            providerTransactionId || payment.providerTransactionId;
        payment.paymentMethod =
            this.toOptionalString(payload.paymentMethod) || payment.paymentMethod;
        if (providerStatus === 'PAYMENT_COMPLETED' &&
            payment.status !== payment_transaction_schema_1.PaymentStatus.PAID) {
            const paidAmount = Number(payload.txnAmount ?? payload.amount ?? 0);
            if (!Number.isFinite(paidAmount) || paidAmount !== payment.amount) {
                this.logger.warn(`[PhaJayWebhook] AMOUNT_MISMATCH ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, expected: payment.amount, received: paidAmount, payload })}`);
                payment.status = payment_transaction_schema_1.PaymentStatus.FAILED;
                await payment.save();
                this.emitPaymentUpdate(payment);
                return { message: 'AMOUNT_MISMATCH' };
            }
            payment.status = payment_transaction_schema_1.PaymentStatus.PAID;
            payment.paidAt = new Date();
            this.logger.log(`[PhaJayWebhook] PAYMENT_COMPLETED ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, amount: paidAmount, transactionId: providerTransactionId })}`);
            await this.sessionsService.clearSession(payment.deviceId);
        }
        else if (['PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'FAILED', 'CANCELLED'].includes(providerStatus || '') &&
            payment.status === payment_transaction_schema_1.PaymentStatus.WAITING) {
            payment.status = payment_transaction_schema_1.PaymentStatus.FAILED;
        }
        await payment.save();
        this.emitPaymentUpdate(payment);
        this.logger.log(`[PhaJayWebhook] PROCESSED ${JSON.stringify({ paymentId: String(payment._id), orderNo: payment.orderNo, providerStatus, localStatus: payment.status })}`);
        return { message: 'OK' };
    }
    async handleBioWebhook(payload, rawBody, signature) {
        const demoMode = process.env.BIO_DEMO_MODE?.trim().toLowerCase() === 'true';
        if (!demoMode) {
            const secret = process.env.BIO_WEBHOOK_SECRET?.trim();
            if (!secret)
                throw new common_1.ServiceUnavailableException('BIO_WEBHOOK_SECRET is not configured');
            if (!rawBody || !signature)
                throw new common_1.BadRequestException('Invalid Bio Payment webhook signature');
            const expected = (0, node_crypto_2.createHmac)('sha256', secret).update(rawBody).digest('hex');
            const actual = Buffer.from(signature.trim(), 'utf8');
            const expectedBuffer = Buffer.from(expected, 'utf8');
            if (actual.length !== expectedBuffer.length || !(0, node_crypto_2.timingSafeEqual)(actual, expectedBuffer)) {
                throw new common_1.BadRequestException('Invalid Bio Payment webhook signature');
            }
        }
        const orderNo = this.toOptionalString(payload.orderNo);
        const transactionId = this.toOptionalString(payload.transactionId);
        const paidAmount = Number(payload.amount ?? payload.txnAmount);
        let payment = await this.findPaymentForWebhook(orderNo, undefined, transactionId);
        if (!payment && demoMode && Number.isFinite(paidAmount)) {
            payment = await this.paymentModel.findOne({
                provider: payment_transaction_schema_1.PaymentProvider.BIO,
                status: payment_transaction_schema_1.PaymentStatus.WAITING,
                amount: paidAmount,
            });
        }
        if (!payment)
            return { message: 'PAYMENT_NOT_FOUND' };
        payment.webhookPayloads = [...(payment.webhookPayloads || []), payload];
        payment.provider = payment_transaction_schema_1.PaymentProvider.BIO;
        payment.providerTransactionId = transactionId || payment.providerTransactionId;
        const currency = this.toOptionalString(payload.currency);
        const idFromProvider = this.toOptionalString(payload.deviceId) || this.toOptionalString(payload.terminalId);
        const idMatches = Boolean(idFromProvider &&
            [payment.deviceId, process.env.BIO_DEVICE_ID?.trim()].includes(idFromProvider));
        const amountMatches = Number.isFinite(paidAmount) && paidAmount === payment.amount;
        const validPayment = demoMode
            ? idMatches || amountMatches
            : payload.event === 'palm_payment.succeeded' && currency === 'LAK' && amountMatches;
        if (!validPayment)
            return { message: 'IGNORED' };
        if (payment.status !== payment_transaction_schema_1.PaymentStatus.PAID) {
            payment.status = payment_transaction_schema_1.PaymentStatus.PAID;
            payment.paidAt = payload.paidAt ? new Date(String(payload.paidAt)) : new Date();
            await this.sessionsService.clearSession(payment.deviceId);
            await payment.save();
            this.emitPaymentUpdate(payment);
        }
        else {
            await payment.save();
        }
        return { message: 'OK' };
    }
    async requestBioIntent(body) {
        const baseUrl = (process.env.BIO_PAYMENT_BASE_URL || 'https://bio-payment-api.phajay.co').replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json' };
        headers['X-Device-Id'] = process.env.BIO_DEVICE_ID?.trim() || body.deviceId;
        const response = await fetch(`${baseUrl}/api/v1/palm/payment-intents`, {
            method: 'POST', headers,
            body: JSON.stringify({ amount: body.amount, currency: 'LAK', orderNo: body.orderNo }),
            signal: AbortSignal.timeout(15000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new common_1.ServiceUnavailableException({ message: 'Bio Payment intent request failed', statusCode: response.status, data });
        return (data && typeof data === 'object' ? data : {});
    }
    async requestPhaJayPaymentLink(body) {
        const secretKey = process.env.PHAJAY_SECRET_KEY || process.env.PHAJAY_TEST_KEY;
        if (!secretKey) {
            throw new common_1.ServiceUnavailableException('PhaJay secret key is not configured');
        }
        const baseUrl = process.env.PHAJAY_BASE_URL || 'https://payment-gateway.phajay.co';
        const mode = process.env.PHAJAY_PAYMENT_MODE || 'sandbox';
        const defaultPath = mode === 'production'
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
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new common_1.ServiceUnavailableException({
                message: 'PhaJay payment link request failed',
                statusCode: response.status,
                data,
            });
        }
        return (data && typeof data === 'object' ? data : {});
    }
    async requestPhaJayQr(body) {
        const mode = (process.env.PHAJAY_PAYMENT_MODE || 'production').trim().toLowerCase();
        const sandbox = mode === 'sandbox' || mode === 'test';
        const secretKey = (sandbox
            ? process.env.PHAJAY_TEST_KEY || process.env.PHAJAY_SECRET_KEY
            : process.env.PHAJAY_SECRET_KEY)?.trim();
        if (!secretKey) {
            throw new common_1.ServiceUnavailableException(sandbox
                ? 'PhaJay test key is not configured'
                : 'PhaJay production secret key is not configured');
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
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new common_1.ServiceUnavailableException({
                message: 'PhaJay QR request failed',
                statusCode: response.status,
                data,
            });
        }
        return (data && typeof data === 'object' ? data : {});
    }
    async findPaymentForWebhook(orderNo, linkCode, transactionId) {
        if (orderNo) {
            const payment = await this.paymentModel.findOne({ orderNo });
            if (payment)
                return payment;
        }
        if (linkCode) {
            const payment = await this.paymentModel.findOne({ linkCode });
            if (payment)
                return payment;
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
    createOrderNo() {
        return `POS${Date.now()}${(0, node_crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
    }
    getQrBank(selectedBank) {
        const value = selectedBank ?? process.env.PHAJAY_QR_BANK ?? 'bcel';
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException('Invalid PhaJay QR bank');
        }
        const bank = value.trim().toLowerCase();
        if (!payment_dto_1.PHAJAY_QR_BANKS.includes(bank)) {
            throw new common_1.BadRequestException(`bank must be one of ${payment_dto_1.PHAJAY_QR_BANKS.join(', ')}`);
        }
        return bank;
    }
    getQueryParam(url, key) {
        try {
            return new URL(url).searchParams.get(key) || undefined;
        }
        catch {
            return undefined;
        }
    }
    toOptionalString(value) {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        return typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : undefined;
    }
    emitPaymentUpdate(payment) {
        this.gateway.emitPaymentUpdate(payment.deviceId, {
            paymentId: String(payment._id),
            orderNo: payment.orderNo,
            amount: payment.amount,
            status: payment.status,
            paidAt: payment.paidAt,
            paymentMethod: payment.paymentMethod,
        });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(payment_transaction_schema_1.PaymentTransaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        sessions_service_1.SessionsService,
        sessions_gateway_1.SessionsGateway,
        tags_service_1.TagsService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map