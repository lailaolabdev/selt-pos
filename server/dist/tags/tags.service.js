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
exports.TagsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tag_schema_1 = require("./schemas/tag.schema");
const product_schema_1 = require("../products/schemas/product.schema");
let TagsService = class TagsService {
    tagModel;
    productModel;
    constructor(tagModel, productModel) {
        this.tagModel = tagModel;
        this.productModel = productModel;
    }
    async sync(data) {
        let tagIds = [];
        if (Array.isArray(data.tagIds)) {
            tagIds = data.tagIds.map((id) => String(id).trim()).filter((id) => id);
        }
        else if (typeof data.tagIds === 'string') {
            tagIds = data.tagIds
                .split(/[,\n\r\s]+/)
                .map((id) => id.trim())
                .filter((id) => id);
        }
        console.log(`[TagsService] Sync mode: ${data.mode}, Cleaned tags count: ${tagIds.length}`);
        if (tagIds.length > 0) {
            console.log(`[TagsService] First 3 tags: ${tagIds.slice(0, 3).join(', ')}`);
        }
        switch (data.mode) {
            case 'add':
                return this.handleAdd(tagIds, data.productId);
            case 'check':
                return this.handleCheck(tagIds);
            case 'checkout':
                return this.handleCheckout(tagIds);
            case 'replace':
                return this.handleReplace(tagIds, data.productId);
            default:
                throw new common_1.BadRequestException('Invalid sync mode');
        }
    }
    async handleAdd(tagIds, productId) {
        if (!productId) {
            throw new common_1.BadRequestException('ProductId is required for "add" mode');
        }
        const product = await this.productModel.findById(productId);
        if (!product) {
            throw new common_1.BadRequestException('Product not found');
        }
        const results = {
            added: 0,
            skipped: 0,
            warnings: [],
        };
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
    async handleReplace(tagIds, productId) {
        if (!productId) {
            throw new common_1.BadRequestException('ProductId is required for "replace" mode');
        }
        if (!mongoose_2.Types.ObjectId.isValid(productId) ||
            !(await this.productModel.findById(productId))) {
            throw new common_1.BadRequestException('Product not found');
        }
        const current = await this.tagModel.find({
            productId: new mongoose_2.Types.ObjectId(productId),
        });
        const incoming = await this.tagModel.find({ tagId: { $in: tagIds } });
        if (incoming.some((tag) => String(tag.productId) !== productId)) {
            throw new common_1.BadRequestException('A scanned tag already belongs to another product');
        }
        const removed = current
            .filter((tag) => !tagIds.includes(tag.tagId))
            .map((tag) => tag.tagId);
        if (removed.length > 0) {
            await this.tagModel.deleteMany({
                productId: new mongoose_2.Types.ObjectId(productId),
                tagId: { $in: removed },
            });
        }
        return this.handleAdd(tagIds, productId);
    }
    async findByProductId(productId) {
        return this.tagModel
            .find({ productId: new mongoose_2.Types.ObjectId(productId) })
            .exec();
    }
    async findExistingTagIds(tagIds) {
        const cleanTagIds = Array.from(new Set(tagIds.map((tagId) => String(tagId).trim()).filter(Boolean)));
        if (cleanTagIds.length === 0)
            return [];
        const rows = await this.tagModel
            .find({ tagId: { $in: cleanTagIds } })
            .lean()
            .exec();
        return rows.map((tag) => ({
            tagId: String(tag.tagId),
            productId: String(tag.productId),
        }));
    }
    async handleCheck(tagIds) {
        const tags = await this.tagModel
            .find({ tagId: { $in: tagIds } })
            .populate('productId')
            .exec();
        const foundTagIds = tags.map((t) => t.tagId);
        const unknownTags = tagIds.filter((id) => !foundTagIds.includes(id));
        return {
            found: tags,
            unknownCount: unknownTags.length,
            unknownTagIds: unknownTags,
        };
    }
    async handleCheckout(tagIds) {
        const tags = await this.tagModel
            .find({ tagId: { $in: tagIds } })
            .populate('productId')
            .exec();
        const foundTagIds = tags.map((t) => t.tagId);
        const unavailableOrUnknown = tagIds.filter((id) => !foundTagIds.includes(id));
        let totalPrice = 0;
        const summaryMap = new Map();
        for (const tag of tags) {
            const product = tag.productId;
            if (!product)
                continue;
            totalPrice += product.basePrice;
            const pId = String(product._id);
            const current = summaryMap.get(pId) || {
                name: product.name,
                imageUrl: product.imageUrl,
                count: 0,
                subtotal: 0,
            };
            current.count++;
            current.subtotal += product.basePrice;
            summaryMap.set(pId, current);
        }
        return {
            transactionId: new mongoose_2.Types.ObjectId().toHexString(),
            items: Array.from(summaryMap.values()),
            totalPrice,
            tagIds: foundTagIds,
            unavailableCount: unavailableOrUnknown.length,
        };
    }
    async confirmSale(transactionId, tagIds) {
        const result = await this.tagModel.updateMany({ tagId: { $in: tagIds }, status: tag_schema_1.TagStatus.AVAILABLE }, { $set: { status: tag_schema_1.TagStatus.SOLD, lastSeenAt: new Date() } });
        return {
            message: 'Sale confirmed',
            updatedCount: result.modifiedCount,
        };
    }
    async getInventorySummary() {
        const tags = await this.tagModel
            .find({})
            .populate('productId')
            .exec();
        const summary = new Map();
        for (const tag of tags) {
            const product = tag.productId;
            if (!product)
                continue;
            const productId = String(product._id);
            const row = summary.get(productId) || {
                productId,
                name: product.name,
                sku: product.sku,
                availableCount: 0,
            };
            row.availableCount++;
            summary.set(productId, row);
        }
        return Array.from(summary.values());
    }
};
exports.TagsService = TagsService;
exports.TagsService = TagsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tag_schema_1.RFIDTag.name)),
    __param(1, (0, mongoose_1.InjectModel)(product_schema_1.Product.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], TagsService);
//# sourceMappingURL=tags.service.js.map