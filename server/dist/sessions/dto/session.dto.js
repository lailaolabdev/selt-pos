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
exports.ClearSessionDto = exports.SetModeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const session_schema_1 = require("../schemas/session.schema");
class SetModeDto {
    deviceId;
    mode;
    productId;
}
exports.SetModeDto = SetModeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'RPi-POS-01',
        description: 'ID ຂອງ RFID hub/reader ຫຼື POS station.',
    }),
    __metadata("design:type", String)
], SetModeDto.prototype, "deviceId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: session_schema_1.DeviceMode,
        example: session_schema_1.DeviceMode.CHECKOUT,
        description: 'IDLE, ADD, CHECK, CHECKOUT. capture endpoint ຈະປະມວນຜົນຕາມ mode ນີ້.',
    }),
    __metadata("design:type", String)
], SetModeDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '66f0c2d4b7f1c9a001234567',
        description: 'product _id ທີ່ໃຊ້ເມື່ອ mode = ADD.',
    }),
    __metadata("design:type", String)
], SetModeDto.prototype, "productId", void 0);
class ClearSessionDto {
    deviceId;
}
exports.ClearSessionDto = ClearSessionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'RPi-POS-01',
        description: 'ID ຂອງ RFID hub/reader ຫຼື POS station ທີ່ຈະ clear basket.',
    }),
    __metadata("design:type", String)
], ClearSessionDto.prototype, "deviceId", void 0);
//# sourceMappingURL=session.dto.js.map