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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePhaJayQrDto = exports.PHAJAY_QR_BANKS = exports.CreatePhaJayPaymentLinkDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreatePhaJayPaymentLinkDto {
    deviceId;
}
exports.CreatePhaJayPaymentLinkDto = CreatePhaJayPaymentLinkDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'RPi-POS-01',
        description: 'POS/RFID device id whose current checkout basket will be paid.',
    }),
    __metadata("design:type", String)
], CreatePhaJayPaymentLinkDto.prototype, "deviceId", void 0);
exports.PHAJAY_QR_BANKS = [
    'bcel',
    'jdb',
    'ldb',
    'ib',
    'stb',
    'm-money',
];
class CreatePhaJayQrDto extends CreatePhaJayPaymentLinkDto {
    bank;
}
exports.CreatePhaJayQrDto = CreatePhaJayQrDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: exports.PHAJAY_QR_BANKS,
        example: 'bcel',
        description: 'Bank selected on the POS payment screen.',
    }),
    __metadata("design:type", String)
], CreatePhaJayQrDto.prototype, "bank", void 0);
//# sourceMappingURL=payment.dto.js.map