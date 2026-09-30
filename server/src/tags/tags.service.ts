import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RFIDTag, TagStatus } from './schemas/tag.schema';
import { Product } from '../products/schemas/product.schema';

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(RFIDTag.name) private tagModel: Model<RFIDTag>,
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  async sync(data: {
    deviceId: string;
    tagIds: string | string[];
    mode: 'add' | 'check' | 'checkout' | 'replace';
    productId?: string;
  }) {
    // Robust parsing: handle both array and comma-separated string
    let tagIds: string[] = [];
    if (Array.isArray(data.tagIds)) {
      tagIds = data.tagIds.map((id) => String(id).trim()).filter((id) => id);
    } else if (typeof data.tagIds === 'string') {
      tagIds = data.tagIds
        .split(/[,\n\r\s]+/)
        .map((id) => id.trim())
        .filter((id) => id);
    }

    console.log(
      `[TagsService] Sync mode: ${data.mode}, Cleaned tags count: ${tagIds.length}`,
    );
    if (tagIds.length > 0) {
      console.log(
        `[TagsService] First 3 tags: ${tagIds.slice(0, 3).join(', ')}`,
      );
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
        throw new BadRequestException('Invalid sync mode');
    }
  }

  private async handleAdd(tagIds: string[], productId?: string) {
    if (!productId) {
      throw new BadRequestException('ProductId is required for "add" mode');
    }

    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new BadRequestException('Product not found');
    }

    const results = {
      added: 0,
      skipped: 0,
      warnings: [] as string[],
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
        productId: new Types.ObjectId(productId),
        status: TagStatus.AVAILABLE,
      }).save();
      results.added++;
    }

    return results;
  }

  private async handleReplace(tagIds: string[], productId?: string) {
    if (!productId) {
      throw new BadRequestException('ProductId is required for "replace" mode');
    }

    if (
      !Types.ObjectId.isValid(productId) ||
      !(await this.productModel.findById(productId))
    ) {
      throw new BadRequestException('Product not found');
    }
    const current = await this.tagModel.find({
      productId: new Types.ObjectId(productId),
    });
    const incoming = await this.tagModel.find({ tagId: { $in: tagIds } });
    if (incoming.some((tag) => String(tag.productId) !== productId)) {
      throw new BadRequestException(
        'A scanned tag already belongs to another product',
      );
    }
    const removed = current
      .filter((tag) => !tagIds.includes(tag.tagId))
      .map((tag) => tag.tagId);
    if (removed.length > 0) {
      await this.tagModel.deleteMany({
        productId: new Types.ObjectId(productId),
        tagId: { $in: removed },
      });
    }
    // Keep existing tag status and identity; editing a product must not turn
    // sold tags back into available stock.
    return this.handleAdd(tagIds, productId);
  }

  async findByProductId(productId: string) {
    return this.tagModel
      .find({ productId: new Types.ObjectId(productId) })
      .exec();
  }

  private async handleCheck(tagIds: string[]) {
    const tags = await this.tagModel
      .find({ tagId: { $in: tagIds } })
      .populate<{ productId: Product | null }>('productId')
      .exec();

    const foundTagIds = tags.map((t) => t.tagId);
    const unknownTags = tagIds.filter((id) => !foundTagIds.includes(id));

    return {
      found: tags,
      unknownCount: unknownTags.length,
      unknownTagIds: unknownTags,
    };
  }

  private async handleCheckout(tagIds: string[]) {
    // 1. Find all 'available' tags from the list
    const tags = await this.tagModel
      .find({
        tagId: { $in: tagIds },
        status: TagStatus.AVAILABLE,
      })
      .populate<{ productId: Product | null }>('productId')
      .exec();

    const foundTagIds = tags.map((t) => t.tagId);
    const unavailableOrUnknown = tagIds.filter(
      (id) => !foundTagIds.includes(id),
    );

    // 2. Calculate total price and group items
    let totalPrice = 0;
    const summaryMap = new Map<
      string,
      { name: string; imageUrl?: string; count: number; subtotal: number }
    >();

    for (const tag of tags) {
      const product = tag.productId;
      if (!product) continue;
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

    // Return transaction details
    return {
      transactionId: new Types.ObjectId().toHexString(), // Mock transaction ID
      items: Array.from(summaryMap.values()),
      totalPrice,
      tagIds: foundTagIds,
      unavailableCount: unavailableOrUnknown.length,
    };
  }

  async confirmSale(transactionId: string, tagIds: string[]) {
    const result = await this.tagModel.updateMany(
      { tagId: { $in: tagIds }, status: TagStatus.AVAILABLE },
      { $set: { status: TagStatus.SOLD, lastSeenAt: new Date() } },
    );

    return {
      message: 'Sale confirmed',
      updatedCount: result.modifiedCount,
    };
  }

  async getInventorySummary() {
    const tags = await this.tagModel
      .find({ status: TagStatus.AVAILABLE })
      .populate<{ productId: Product | null }>('productId')
      .exec();
    const summary = new Map<
      string,
      { productId: string; name: string; sku: string; availableCount: number }
    >();
    for (const tag of tags) {
      const product = tag.productId;
      if (!product) continue;
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
}
