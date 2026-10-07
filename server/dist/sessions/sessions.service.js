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
exports.SessionsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const session_schema_1 = require("./schemas/session.schema");
const tag_schema_1 = require("../tags/schemas/tag.schema");
const product_schema_1 = require("../products/schemas/product.schema");
const sessions_gateway_1 = require("./sessions.gateway");
const node_crypto_1 = require("node:crypto");
const BASKET_REUSE_WINDOW_MS = 10_000;
let SessionsService = class SessionsService {
    sessionModel;
    tagModel;
    productModel;
    gateway;
    constructor(sessionModel, tagModel, productModel, gateway) {
        this.sessionModel = sessionModel;
        this.tagModel = tagModel;
        this.productModel = productModel;
        this.gateway = gateway;
    }
    async getOrCreateSession(deviceId) {
        let session = await this.sessionModel.findOne({ deviceId });
        if (!session) {
            session = await new this.sessionModel({
                deviceId,
                currentMode: session_schema_1.DeviceMode.IDLE,
            }).save();
        }
        return session;
    }
    async setMode(deviceId, mode, productId) {
        if (!deviceId?.trim() || !Object.values(session_schema_1.DeviceMode).includes(mode)) {
            throw new common_1.BadRequestException('Valid deviceId and mode are required');
        }
        if (mode === session_schema_1.DeviceMode.ADD &&
            (!productId ||
                !mongoose_2.Types.ObjectId.isValid(productId) ||
                !(await this.productModel.findById(productId)))) {
            throw new common_1.BadRequestException('Select an existing product for ADD mode');
        }
        const session = await this.getOrCreateSession(deviceId);
        session.currentMode = mode;
        if (productId) {
            session.activeProductId = new mongoose_2.Types.ObjectId(productId);
        }
        else {
            session.activeProductId = undefined;
        }
        await session.save();
        this.gateway.emitSessionUpdate(deviceId, { mode, productId });
        return session;
    }
    normalizeTagIds(tagIds) {
        const uniqueSorted = (ids) => Array.from(new Set(ids)).sort();
        if (Array.isArray(tagIds)) {
            return uniqueSorted(tagIds.map((id) => String(id).trim()).filter(Boolean));
        }
        if (typeof tagIds === 'string') {
            return uniqueSorted(tagIds
                .split(/[,\n\r\s]+/)
                .map((id) => id.trim())
                .filter(Boolean));
        }
        return [];
    }
    makeBasketKey(tagIds) {
        return tagIds.join('|');
    }
    async handleCapture(deviceId, tagIds, status) {
        const cleanTagIds = this.normalizeTagIds(tagIds);
        console.log(`\n📥 [Incoming Capture] Device: ${deviceId}, Tags: ${cleanTagIds.length}, Status: ${status}`);
        console.log(`🏷️  Tags: ${cleanTagIds.length > 0 ? cleanTagIds.join(', ') : '<empty>'}`);
        const session = await this.getOrCreateSession(deviceId);
        console.log(`🔄 [Session Status] Mode: ${session.currentMode}, ActiveProduct: ${session.activeProductId?.toString() || 'None'}`);
        const now = new Date();
        const basketKey = this.makeBasketKey(cleanTagIds);
        const previousTagIds = this.normalizeTagIds(session.lastScanData);
        const previousHadTags = previousTagIds.length > 0;
        const previousBasketId = session.currentBasketId;
        const lastBasketSeenAt = session.lastBasketSeenAt?.getTime?.() || 0;
        const isSameBasketKey = Boolean(session.lastBasketKey && basketKey === session.lastBasketKey);
        const canReuseRecentBasket = Boolean(previousBasketId &&
            lastBasketSeenAt &&
            now.getTime() - lastBasketSeenAt < BASKET_REUSE_WINDOW_MS);
        let basketId = previousBasketId;
        let isNewBasket = false;
        if (cleanTagIds.length > 0) {
            const isDifferentBasketAfterEmpty = !previousHadTags && session.lastBasketKey && !isSameBasketKey;
            if (!basketId || !canReuseRecentBasket || isDifferentBasketAfterEmpty) {
                basketId = new mongoose_2.Types.ObjectId().toHexString();
                isNewBasket = true;
            }
            session.currentBasketId = basketId;
            session.lastBasketKey = basketKey;
            session.lastBasketSeenAt = now;
        }
        session.lastScanData = cleanTagIds;
        session.lastScanStatus =
            cleanTagIds.length === 0
                ? 'IDLE'
                : status === 'SCANNING'
                    ? 'SCANNING'
                    : 'STABLE';
        session.lastCapturedAt = now;
        await session.save();
        let result;
        switch (session.currentMode) {
            case session_schema_1.DeviceMode.ADD:
                result = await this.processAdd(cleanTagIds, session.activeProductId?.toString());
                break;
            case session_schema_1.DeviceMode.CHECK:
                result = await this.processCheck(cleanTagIds);
                break;
            case session_schema_1.DeviceMode.CHECKOUT:
                result = await this.processCheckout(cleanTagIds);
                break;
            default:
                result = {
                    message: 'Device is IDLE, scan ignored',
                    tagIds: cleanTagIds,
                };
        }
        this.gateway.emitScanUpdate(deviceId, {
            tagIds: cleanTagIds,
            lastCapturedAt: session.lastCapturedAt,
            mode: session.currentMode,
            result: {
                ...result,
                basketId,
                basketKey,
                isNewBasket,
            },
            status: session.lastScanStatus,
            basketId,
            basketKey,
            isNewBasket,
        });
        return result;
    }
    async simulateDevProduct(deviceId, productId) {
        if (process.env.ENV !== 'dev')
            throw new common_1.BadRequestException('Development simulator is disabled');
        if (!deviceId?.trim() || !mongoose_2.Types.ObjectId.isValid(productId))
            throw new common_1.BadRequestException('Valid deviceId and productId are required');
        const product = await this.productModel.findById(productId);
        if (!product)
            throw new common_1.BadRequestException('Product not found');
        const session = await this.getOrCreateSession(deviceId);
        const currentTagIds = this.normalizeTagIds(session.lastScanData);
        const tagId = `DEV-${(0, node_crypto_1.randomUUID)()}`;
        await new this.tagModel({ tagId, productId: new mongoose_2.Types.ObjectId(productId), status: tag_schema_1.TagStatus.AVAILABLE }).save();
        await this.handleCapture(deviceId, [...currentTagIds, tagId], 'STABLE');
        return { tagId, productId: String(product._id), name: product.name };
    }
    async clearSession(deviceId) {
        const session = await this.getOrCreateSession(deviceId);
        session.lastScanData = [];
        session.lastScanStatus = 'IDLE';
        session.currentBasketId = undefined;
        session.lastBasketKey = undefined;
        session.lastBasketSeenAt = undefined;
        await session.save();
        this.gateway.emitScanUpdate(deviceId, {
            mode: session.currentMode,
            status: 'IDLE',
            tagIds: [],
            result: { items: [], totalPrice: 0, tagIds: [] },
        });
        return { message: 'Session cleared' };
    }
    async getSnapshot(deviceId) {
        const session = await this.getOrCreateSession(deviceId);
        const tagIds = this.normalizeTagIds(session.lastScanData);
        let result = { items: [], totalPrice: 0, tagIds };
        if (session.currentMode === session_schema_1.DeviceMode.CHECKOUT && tagIds.length > 0) {
            result = await this.processCheckout(tagIds);
        }
        else if (session.currentMode === session_schema_1.DeviceMode.CHECK) {
            result = await this.processCheck(tagIds);
        }
        return {
            deviceId,
            mode: session.currentMode,
            tagIds,
            lastCapturedAt: session.lastCapturedAt,
            status: tagIds.length > 0
                ? session.lastScanStatus === 'SCANNING'
                    ? 'SCANNING'
                    : 'STABLE'
                : 'IDLE',
            basketId: session.currentBasketId,
            basketKey: this.makeBasketKey(tagIds),
            result: {
                ...result,
                basketId: session.currentBasketId,
                basketKey: this.makeBasketKey(tagIds),
            },
        };
    }
    async processAdd(tagIds, productId) {
        if (!productId)
            return { error: 'No active product selected for ADD mode' };
        const results = { added: 0, skipped: 0, warnings: [] };
        for (const tagId of tagIds) {
            const existing = await this.tagModel.findOne({ tagId });
            if (existing) {
                results.skipped++;
                results.warnings.push(`Tag ${tagId} already exists`);
                continue;
            }
            await new this.tagModel({
                tagId,
                productId: new mongoose_2.Types.ObjectId(productId),
                status: tag_schema_1.TagStatus.AVAILABLE,
            }).save();
            results.added++;
        }
        return results;
    }
    async processCheck(tagIds) {
        const tags = await this.tagModel
            .find({ tagId: { $in: tagIds } })
            .populate('productId');
        const foundIds = tags.map((t) => t.tagId);
        const unknown = tagIds.filter((id) => !foundIds.includes(id));
        return {
            tagIds,
            found: tags,
            unknownCount: unknown.length,
            unknownTagIds: unknown,
        };
    }
    async processCheckout(tagIds) {
        const tags = await this.tagModel
            .find({ tagId: { $in: tagIds } })
            .populate('productId');
        let totalPrice = 0;
        const summary = new Map();
        const acceptedTagIds = [];
        const unavailableTagIds = [];
        const unknownTagIds = tagIds.filter((id) => !tags.some((tag) => tag.tagId === id));
        for (const tag of tags) {
            const product = tag.productId;
            if (!product) {
                unavailableTagIds.push(tag.tagId);
                continue;
            }
            acceptedTagIds.push(tag.tagId);
            totalPrice += product.basePrice;
            const pId = String(product._id);
            const item = summary.get(pId) || {
                name: product.name,
                imageUrl: product.imageUrl,
                count: 0,
                subtotal: 0,
            };
            item.count++;
            item.subtotal += product.basePrice;
            summary.set(pId, item);
        }
        return {
            transactionId: new mongoose_2.Types.ObjectId().toHexString(),
            items: Array.from(summary.values()),
            totalPrice,
            tagIds: acceptedTagIds,
            scannedTagIds: tagIds,
            unknownTagIds,
            unavailableTagIds,
        };
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(session_schema_1.DeviceSession.name)),
    __param(1, (0, mongoose_1.InjectModel)(tag_schema_1.RFIDTag.name)),
    __param(2, (0, mongoose_1.InjectModel)(product_schema_1.Product.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        sessions_gateway_1.SessionsGateway])
], SessionsService);
//# sourceMappingURL=sessions.service.js.map