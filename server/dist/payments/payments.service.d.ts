import { Model } from 'mongoose';
import { SessionsService } from '../sessions/sessions.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { TagsService } from '../tags/tags.service';
import { PaymentStatus, PaymentTransaction, PaymentProvider } from './schemas/payment-transaction.schema';
export declare class PaymentsService {
    private readonly paymentModel;
    private readonly sessionsService;
    private readonly gateway;
    private readonly tagsService;
    private readonly logger;
    constructor(paymentModel: Model<PaymentTransaction>, sessionsService: SessionsService, gateway: SessionsGateway, tagsService: TagsService);
    createPhaJayPaymentLink(deviceId: string): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: PaymentStatus;
        redirectURL: string;
    }>;
    createPhaJayQrPayment(deviceId: string, selectedBank?: unknown): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: PaymentStatus;
        bank: string;
        qrCode: string;
        link: string | undefined;
        transactionId: string;
    }>;
    createBioPaymentIntent(deviceId: string): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: PaymentStatus;
        provider: PaymentProvider;
        intentId: string;
        expiresInSeconds: number;
    }>;
    getStatus(paymentId: string): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: PaymentStatus;
        redirectURL: string | undefined;
        qrCode: string | undefined;
        link: string | undefined;
        bank: string | undefined;
        paidAt: Date | undefined;
        paymentMethod: string | undefined;
    }>;
    cancelPayment(paymentId: string, deviceId: string): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: PaymentStatus.CANCELLED;
    }>;
    getReceipt(paymentId: string): Promise<{
        paymentId: string;
        orderNo: string;
        deviceId: string;
        amount: number;
        currency: string;
        status: PaymentStatus.PAID;
        paidAt: Date | undefined;
        paymentMethod: string;
        items: {
            name: string;
            count: number;
            subtotal: number;
        }[];
    }>;
    handlePhaJayWebhook(payload: Record<string, any>, meta?: {
        rawBody?: Buffer;
        headers?: Record<string, string | string[] | undefined>;
        ip?: string;
    }): Promise<{
        message: string;
    }>;
    handleBioWebhook(payload: Record<string, unknown>, rawBody: Buffer | undefined, signature?: string): Promise<{
        message: string;
    }>;
    private requestBioIntent;
    private requestPhaJayPaymentLink;
    private requestPhaJayQr;
    private findPaymentForWebhook;
    private createOrderNo;
    private getQrBank;
    private getQueryParam;
    private toOptionalString;
    private emitPaymentUpdate;
}
