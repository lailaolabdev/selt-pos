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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const payment_dto_1 = require("./dto/payment.dto");
const payments_service_1 = require("./payments.service");
let PaymentsController = class PaymentsController {
    paymentsService;
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    createPaymentLink(data) {
        return this.paymentsService.createPhaJayPaymentLink(data.deviceId);
    }
    createQr(data) {
        return this.paymentsService.createPhaJayQrPayment(data.deviceId, data.bank);
    }
    createBioIntent(data) {
        return this.paymentsService.createBioPaymentIntent(data.deviceId);
    }
    handleBioWebhook(payload, request) {
        return this.paymentsService.handleBioWebhook(payload, request.rawBody);
    }
    getStatus(paymentId) {
        return this.paymentsService.getStatus(paymentId);
    }
    cancelPayment(paymentId, data) {
        return this.paymentsService.cancelPayment(paymentId, data.deviceId);
    }
    getReceipt(paymentId) {
        return this.paymentsService.getReceipt(paymentId);
    }
    handleWebhook(payload, headers, request) {
        return this.paymentsService.handlePhaJayWebhook(payload, {
            rawBody: request.rawBody,
            headers,
            ip: request.ip,
        });
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)('payment-link'),
    (0, swagger_1.ApiOperation)({
        summary: 'Create PhaJay Payment Link for the current POS basket',
        description: 'Reads the current CHECKOUT snapshot for deviceId, creates a local payment transaction, and requests a PhaJay payment link.',
    }),
    (0, swagger_1.ApiBody)({ type: payment_dto_1.CreatePhaJayPaymentLinkDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'PhaJay payment link created.',
        schema: {
            example: {
                paymentId: '66f0c2d4b7f1c9a001234999',
                orderNo: 'POS1756130000000A1B2C3',
                amount: 198000,
                status: 'WAITING',
                redirectURL: 'https://payment-link-sandbox.netlify.app?amount=198000&linkCode=ABC123',
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_dto_1.CreatePhaJayPaymentLinkDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "createPaymentLink", null);
__decorate([
    (0, common_1.Post)('qr'),
    (0, swagger_1.ApiOperation)({
        summary: 'Create PhaJay QR payment for the current POS basket',
        description: 'Reads the current CHECKOUT snapshot for deviceId and requests a bank QR from PhaJay without redirecting the POS screen.',
    }),
    (0, swagger_1.ApiBody)({ type: payment_dto_1.CreatePhaJayQrDto }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_dto_1.CreatePhaJayQrDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "createQr", null);
__decorate([
    (0, common_1.Post)('bio/intent'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payment_dto_1.CreatePhaJayPaymentLinkDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "createBioIntent", null);
__decorate([
    (0, common_1.Post)('bio/webhook'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "handleBioWebhook", null);
__decorate([
    (0, common_1.Get)(':paymentId/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get local PhaJay payment status' }),
    (0, swagger_1.ApiParam)({ name: 'paymentId', example: '66f0c2d4b7f1c9a001234999' }),
    __param(0, (0, common_1.Param)('paymentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)(':paymentId/cancel'),
    (0, swagger_1.ApiOperation)({
        summary: 'Cancel a waiting PhaJay payment and clear the POS payment queue',
    }),
    (0, swagger_1.ApiParam)({ name: 'paymentId', example: '66f0c2d4b7f1c9a001234999' }),
    __param(0, (0, common_1.Param)('paymentId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, payment_dto_1.CreatePhaJayPaymentLinkDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "cancelPayment", null);
__decorate([
    (0, common_1.Get)(':paymentId/receipt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get immutable receipt data for a paid transaction',
    }),
    __param(0, (0, common_1.Param)('paymentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "getReceipt", null);
__decorate([
    (0, common_1.Post)('webhook'),
    (0, swagger_1.ApiOperation)({
        summary: 'PhaJay webhook callback',
        description: 'Configure this URL in PhaJay portal. On PAYMENT_COMPLETED it marks RFID tags as sold and clears the POS basket.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "handleWebhook", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)('payments/phajay'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map