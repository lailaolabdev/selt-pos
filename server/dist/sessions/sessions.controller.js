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
exports.SessionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sessions_service_1 = require("./sessions.service");
const session_dto_1 = require("./dto/session.dto");
let SessionsController = class SessionsController {
    sessionsService;
    constructor(sessionsService) {
        this.sessionsService = sessionsService;
    }
    async setMode(data) {
        return this.sessionsService.setMode(data.deviceId, data.mode, data.productId);
    }
    async clear(data) {
        return this.sessionsService.clearSession(data.deviceId);
    }
    async snapshot(deviceId) {
        return this.sessionsService.getSnapshot(deviceId);
    }
};
exports.SessionsController = SessionsController;
__decorate([
    (0, common_1.Post)('set-mode'),
    (0, swagger_1.ApiOperation)({
        summary: 'Set RFID/POS device mode',
        description: [
            'ຕັ້ງ mode ໃຫ້ deviceId ກ່ອນ RFID hub ຍິງ /tags/capture.',
            'ຕົວຢ່າງ test checkout: deviceId = RPi-POS-01, mode = CHECKOUT.',
            'ຕົວຢ່າງ register tag ເຂົ້າສິນຄ້າ: mode = ADD ແລະໃສ່ productId.',
        ].join('\n'),
    }),
    (0, swagger_1.ApiBody)({ type: session_dto_1.SetModeDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Updated or created device session.',
        schema: {
            example: {
                deviceId: 'RPi-POS-01',
                currentMode: 'CHECKOUT',
                activeProductId: null,
                lastScanData: [],
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [session_dto_1.SetModeDto]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "setMode", null);
__decorate([
    (0, common_1.Post)('clear'),
    (0, swagger_1.ApiOperation)({
        summary: 'Clear device basket/session scan data',
        description: 'ລ້າງ lastScanData ຂອງ deviceId ແລະ emit empty basket ໄປຫາ POS frontend.',
    }),
    (0, swagger_1.ApiBody)({ type: session_dto_1.ClearSessionDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Session cleared.', schema: { example: { message: 'Session cleared' } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [session_dto_1.ClearSessionDto]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "clear", null);
__decorate([
    (0, common_1.Get)(':deviceId/snapshot'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get current device basket snapshot',
        description: 'ດຶງສະຖານະກະຕ່າລ່າສຸດ ໃຊ້ເມື່ອ POS reload ຫຼື socket reconnect.',
    }),
    (0, swagger_1.ApiParam)({ name: 'deviceId', example: 'RPi-POS-01' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Current session snapshot.' }),
    __param(0, (0, common_1.Param)('deviceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "snapshot", null);
exports.SessionsController = SessionsController = __decorate([
    (0, swagger_1.ApiTags)('Session'),
    (0, common_1.Controller)('session'),
    __metadata("design:paramtypes", [sessions_service_1.SessionsService])
], SessionsController);
//# sourceMappingURL=sessions.controller.js.map