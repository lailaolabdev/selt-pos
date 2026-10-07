import type { Request } from 'express';
import { CreatePhaJayPaymentLinkDto, CreatePhaJayQrDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    createPaymentLink(data: CreatePhaJayPaymentLinkDto): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: import("./schemas/payment-transaction.schema").PaymentStatus;
        redirectURL: string;
    }>;
    createQr(data: CreatePhaJayQrDto): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: import("./schemas/payment-transaction.schema").PaymentStatus;
        bank: string;
        qrCode: string;
        link: string | undefined;
        transactionId: string;
    }>;
    createBioIntent(data: CreatePhaJayPaymentLinkDto): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: import("./schemas/payment-transaction.schema").PaymentStatus;
        provider: import("./schemas/payment-transaction.schema").PaymentProvider;
        intentId: string;
        expiresInSeconds: number;
    }>;
    handleBioWebhook(payload: Record<string, unknown>, signature: string | undefined, request: Request & {
        rawBody?: Buffer;
    }): Promise<{
        message: string;
    }>;
    getStatus(paymentId: string): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: import("./schemas/payment-transaction.schema").PaymentStatus;
        redirectURL: string | undefined;
        qrCode: string | undefined;
        link: string | undefined;
        bank: string | undefined;
        paidAt: Date | undefined;
        paymentMethod: string | undefined;
    }>;
    cancelPayment(paymentId: string, data: CreatePhaJayPaymentLinkDto): Promise<{
        paymentId: string;
        orderNo: string;
        amount: number;
        status: import("./schemas/payment-transaction.schema").PaymentStatus.CANCELLED;
    }>;
    getReceipt(paymentId: string): Promise<{
        paymentId: string;
        orderNo: string;
        deviceId: string;
        amount: number;
        currency: string;
        status: import("./schemas/payment-transaction.schema").PaymentStatus.PAID;
        paidAt: Date | undefined;
        paymentMethod: string;
        items: {
            name: string;
            count: number;
            subtotal: number;
        }[];
    }>;
    handleWebhook(payload: Record<string, any>): Promise<{
        message: string;
    }>;
}
