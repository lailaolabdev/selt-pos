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
exports.InventoryController = exports.TagsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_auth_guard_1 = require("../auth/admin-auth.guard");
const tags_service_1 = require("./tags.service");
const sessions_service_1 = require("../sessions/sessions.service");
const tags_dto_1 = require("./dto/tags.dto");
let TagsController = class TagsController {
    tagsService;
    sessionsService;
    constructor(tagsService, sessionsService) {
        this.tagsService = tagsService;
        this.sessionsService = sessionsService;
    }
    async capture(data) {
        return this.sessionsService.handleCapture(data.deviceId, data.tagIds, data.status);
    }
    async captureDevProduct(data) {
        return this.sessionsService.simulateDevProduct(data.deviceId, data.productId);
    }
    async sync(data) {
        return this.tagsService.sync(data);
    }
    async checkDuplicates(data) {
        return { duplicates: await this.tagsService.findExistingTagIds(data.tagIds || []) };
    }
    async confirmSale(data) {
        return this.tagsService.confirmSale(data.transactionId, data.tagIds);
    }
    async findByProductId(productId) {
        return this.tagsService.findByProductId(productId);
    }
};
exports.TagsController = TagsController;
__decorate([
    (0, common_1.Post)('capture'),
    (0, swagger_1.ApiOperation)({
        summary: 'RFID hub capture',
        description: [
            'Endpoint ຫຼັກທີ່ RFID hub ໃຊ້ສົ່ງ tagIds ມາ server.',
            'Server ຈະເບິ່ງ session mode ຂອງ deviceId ກ່ອນ:',
            '- IDLE: ຮັບແຕ່ບໍ່ຄິດໄລ່',
            '- ADD: ຜູກ tagIds ເຂົ້າ productId ທີ່ active ໃນ session',
            '- CHECK: ກວດວ່າ tag ຮູ້ຈັກ ຫຼື unknown',
            '- CHECKOUT: ຄິດໄລ່ລາຍການສິນຄ້າ ແລະ totalPrice',
            '',
            'ການທົດສອບໃນ Swagger: ໃຫ້ POST /session/set-mode ເປັນ CHECKOUT ກ່ອນ, ແລ້ວຍິງ endpoint ນີ້.',
        ].join('\n'),
    }),
    (0, swagger_1.ApiBody)({ type: tags_dto_1.CaptureTagsDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Result depends on current device session mode.',
        schema: {
            example: {
                transactionId: '66f0c2d4b7f1c9a001234999',
                items: [
                    {
                        name: 'ເສື້ອ 4B Digital Week',
                        imageUrl: 'https://placehold.co/600x400?text=4B+Product',
                        count: 2,
                        subtotal: 198000,
                    },
                ],
                totalPrice: 198000,
                tagIds: ['E280689400004003ABCD0001', 'E280689400004003ABCD0002'],
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tags_dto_1.CaptureTagsDto]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "capture", null);
__decorate([
    (0, common_1.Post)('dev/capture-product'),
    (0, swagger_1.ApiOperation)({
        summary: 'Development-only simulated RFID scan',
        description: 'Adds one generated DEV tag for a product and feeds it through the normal capture flow. Requires ENV=dev.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "captureDevProduct", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)('admin-token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Manual RFID tag sync',
        description: 'Endpoint ສຳລັບ test/admin sync tags ໂດຍບໍ່ຕ້ອງໃຊ້ session mode. RFID hub flow ຫຼັກແນະນຳໃຊ້ /tags/capture.',
    }),
    (0, swagger_1.ApiBody)({ type: tags_dto_1.SyncTagsDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Sync result.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tags_dto_1.SyncTagsDto]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)('check-duplicates'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)('admin-token'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "checkDuplicates", null);
__decorate([
    (0, common_1.Patch)('confirm-sale'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)('admin-token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Confirm sale',
        description: 'Mark RFID tags ຈາກ checkout ໃຫ້ເປັນ sold. ຄວນເອີ້ນຫຼັງຈາກ payment success.',
    }),
    (0, swagger_1.ApiBody)({ type: tags_dto_1.ConfirmSaleDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Sale confirmation result.',
        schema: { example: { message: 'Sale confirmed', updatedCount: 2 } },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tags_dto_1.ConfirmSaleDto]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "confirmSale", null);
__decorate([
    (0, common_1.Get)('product/:productId'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)('admin-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Find tags by product id' }),
    (0, swagger_1.ApiParam)({ name: 'productId', example: '66f0c2d4b7f1c9a001234567', description: 'MongoDB product _id.' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'RFID tags linked to product.' }),
    __param(0, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "findByProductId", null);
exports.TagsController = TagsController = __decorate([
    (0, swagger_1.ApiTags)('RFID Hub'),
    (0, common_1.Controller)('tags'),
    __metadata("design:paramtypes", [tags_service_1.TagsService,
        sessions_service_1.SessionsService])
], TagsController);
let InventoryController = class InventoryController {
    tagsService;
    constructor(tagsService) {
        this.tagsService = tagsService;
    }
    async getSummary() {
        return this.tagsService.getInventorySummary();
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('summary'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)('admin-token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Inventory summary',
        description: 'ສະຫຼຸບ stock ທີ່ status = available ໂດຍ group ຕາມ product.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Inventory summary grouped by product.',
        schema: {
            example: [
                {
                    productId: '66f0c2d4b7f1c9a001234567',
                    name: 'ເສື້ອ 4B Digital Week',
                    sku: 'TSHIRT-4B-001',
                    availableCount: 25,
                },
            ],
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "getSummary", null);
exports.InventoryController = InventoryController = __decorate([
    (0, swagger_1.ApiTags)('Inventory'),
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [tags_service_1.TagsService])
], InventoryController);
//# sourceMappingURL=tags.controller.js.map