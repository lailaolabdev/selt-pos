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
exports.ConfirmSaleDto = exports.SyncTagsDto = exports.CaptureTagsDto = exports.TagSyncModeDto = exports.ScannerStatusDto = void 0;
const swagger_1 = require("@nestjs/swagger");
var ScannerStatusDto;
(function (ScannerStatusDto) {
    ScannerStatusDto["IDLE"] = "IDLE";
    ScannerStatusDto["SCANNING"] = "SCANNING";
    ScannerStatusDto["STABLE"] = "STABLE";
})(ScannerStatusDto || (exports.ScannerStatusDto = ScannerStatusDto = {}));
var TagSyncModeDto;
(function (TagSyncModeDto) {
    TagSyncModeDto["ADD"] = "add";
    TagSyncModeDto["CHECK"] = "check";
    TagSyncModeDto["CHECKOUT"] = "checkout";
    TagSyncModeDto["REPLACE"] = "replace";
})(TagSyncModeDto || (exports.TagSyncModeDto = TagSyncModeDto = {}));
class CaptureTagsDto {
    deviceId;
    tagIds;
    status;
}
exports.CaptureTagsDto = CaptureTagsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'RPi-POS-01',
        description: 'ID ຂອງ RFID hub/reader. POS frontend ໃຊ້ deviceId ນີ້ເພື່ອ sync session.',
    }),
    __metadata("design:type", String)
], CaptureTagsDto.prototype, "deviceId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
        description: 'RFID tag ids ທີ່ hub ອ່ານໄດ້ຈາກຕະກ້າປັດຈຸບັນ.',
        isArray: true,
        type: String,
    }),
    __metadata("design:type", Array)
], CaptureTagsDto.prototype, "tagIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ScannerStatusDto,
        example: ScannerStatusDto.STABLE,
        description: 'ສະຖານະການອ່ານຈາກ hub. STABLE ໝາຍເຖິງອ່ານຈົບແລ້ວ.',
    }),
    __metadata("design:type", String)
], CaptureTagsDto.prototype, "status", void 0);
class SyncTagsDto {
    deviceId;
    tagIds;
    mode;
    productId;
}
exports.SyncTagsDto = SyncTagsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'RPi-POS-01' }),
    __metadata("design:type", String)
], SyncTagsDto.prototype, "deviceId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
        description: 'ຮັບໄດ້ທັງ array ແລະ string ທີ່ຂັ້ນດ້ວຍ comma/space/newline.',
        isArray: true,
        type: String,
    }),
    __metadata("design:type", Array)
], SyncTagsDto.prototype, "tagIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: TagSyncModeDto,
        example: TagSyncModeDto.CHECKOUT,
        description: 'add/register tag, check tag, checkout basket, ຫຼື replace tag ຂອງສິນຄ້າ.',
    }),
    __metadata("design:type", String)
], SyncTagsDto.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '66f0c2d4b7f1c9a001234567',
        description: 'MongoDB product _id. ຈຳເປັນສຳລັບ mode add ແລະ replace.',
    }),
    __metadata("design:type", String)
], SyncTagsDto.prototype, "productId", void 0);
class ConfirmSaleDto {
    transactionId;
    tagIds;
}
exports.ConfirmSaleDto = ConfirmSaleDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '66f0c2d4b7f1c9a001234999',
        description: 'transactionId ທີ່ໄດ້ຈາກ checkout response.',
    }),
    __metadata("design:type", String)
], ConfirmSaleDto.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
        description: 'RFID tag ids ທີ່ຈະ mark ເປັນ sold.',
        isArray: true,
        type: String,
    }),
    __metadata("design:type", Array)
], ConfirmSaleDto.prototype, "tagIds", void 0);
//# sourceMappingURL=tags.dto.js.map