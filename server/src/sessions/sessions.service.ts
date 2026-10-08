import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeviceSession, DeviceMode } from './schemas/session.schema';
import { RFIDTag, TagStatus } from '../tags/schemas/tag.schema';
import { Product } from '../products/schemas/product.schema';
import { SessionsGateway } from './sessions.gateway';
import { randomUUID } from 'node:crypto';

const BASKET_REUSE_WINDOW_MS = 10_000;

interface SnapshotResult {
  items?: {
    name: string;
    imageUrl?: string;
    count: number;
    subtotal: number;
  }[];
  totalPrice?: number;
  tagIds: string[];
  [key: string]: unknown;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(DeviceSession.name) private sessionModel: Model<DeviceSession>,
    @InjectModel(RFIDTag.name) private tagModel: Model<RFIDTag>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    private readonly gateway: SessionsGateway,
  ) {}

  async getOrCreateSession(deviceId: string): Promise<DeviceSession> {
    let session = await this.sessionModel.findOne({ deviceId });
    if (!session) {
      session = await new this.sessionModel({
        deviceId,
        currentMode: DeviceMode.IDLE,
      }).save();
    }
    return session;
  }

  async setMode(deviceId: string, mode: DeviceMode, productId?: string) {
    if (!deviceId?.trim() || !Object.values(DeviceMode).includes(mode)) {
      throw new BadRequestException('Valid deviceId and mode are required');
    }
    if (
      mode === DeviceMode.ADD &&
      (!productId ||
        !Types.ObjectId.isValid(productId) ||
        !(await this.productModel.findById(productId)))
    ) {
      throw new BadRequestException('Select an existing product for ADD mode');
    }
    const session = await this.getOrCreateSession(deviceId);
    session.currentMode = mode;
    if (productId) {
      session.activeProductId = new Types.ObjectId(productId);
    } else {
      session.activeProductId = undefined;
    }
    await session.save();
    this.gateway.emitSessionUpdate(deviceId, { mode, productId });
    return session;
  }

  private normalizeTagIds(tagIds: unknown): string[] {
    const uniqueSorted = (ids: string[]) => Array.from(new Set(ids)).sort();

    if (Array.isArray(tagIds)) {
      return uniqueSorted(
        tagIds.map((id) => String(id).trim()).filter(Boolean),
      );
    }

    if (typeof tagIds === 'string') {
      return uniqueSorted(
        tagIds
          .split(/[,\n\r\s]+/)
          .map((id) => id.trim())
          .filter(Boolean),
      );
    }

    return [];
  }

  private makeBasketKey(tagIds: string[]) {
    return tagIds.join('|');
  }

  async handleCapture(deviceId: string, tagIds: unknown, status?: string) {
    const cleanTagIds = this.normalizeTagIds(tagIds);

    console.log(
      `\n📥 [Incoming Capture] Device: ${deviceId}, Tags: ${cleanTagIds.length}, Status: ${status}`,
    );
    console.log(
      `🏷️  Tags: ${cleanTagIds.length > 0 ? cleanTagIds.join(', ') : '<empty>'}`,
    );

    const session = await this.getOrCreateSession(deviceId);
    console.log(
      `🔄 [Session Status] Mode: ${session.currentMode}, ActiveProduct: ${session.activeProductId?.toString() || 'None'}`,
    );

    if (session.currentMode === DeviceMode.PAYMENT) {
      const lockedTagIds = this.normalizeTagIds(session.lastScanData);
      const lockedResult = await this.processCheckout(lockedTagIds);
      this.gateway.emitScanUpdate(deviceId, {
        tagIds: lockedTagIds,
        lastCapturedAt: session.lastCapturedAt,
        mode: DeviceMode.PAYMENT,
        result: {
          ...lockedResult,
          basketId: session.currentBasketId,
          basketKey: this.makeBasketKey(lockedTagIds),
          isNewBasket: false,
        },
        status: 'STABLE',
        basketId: session.currentBasketId,
        basketKey: this.makeBasketKey(lockedTagIds),
        isNewBasket: false,
      });
      return lockedResult;
    }

    const now = new Date();
    const basketKey = this.makeBasketKey(cleanTagIds);
    const previousTagIds = this.normalizeTagIds(session.lastScanData);
    const previousHadTags = previousTagIds.length > 0;
    const previousBasketId = session.currentBasketId;
    const lastBasketSeenAt = session.lastBasketSeenAt?.getTime?.() || 0;
    const isSameBasketKey = Boolean(
      session.lastBasketKey && basketKey === session.lastBasketKey,
    );
    const canReuseRecentBasket = Boolean(
      previousBasketId &&
      lastBasketSeenAt &&
      now.getTime() - lastBasketSeenAt < BASKET_REUSE_WINDOW_MS,
    );
    let basketId = previousBasketId;
    let isNewBasket = false;

    if (cleanTagIds.length > 0) {
      const isDifferentBasketAfterEmpty =
        !previousHadTags && session.lastBasketKey && !isSameBasketKey;
      if (!basketId || !canReuseRecentBasket || isDifferentBasketAfterEmpty) {
        basketId = new Types.ObjectId().toHexString();
        isNewBasket = true;
      }
      session.currentBasketId = basketId;
      session.lastBasketKey = basketKey;
      session.lastBasketSeenAt = now;
    }

    // The Go scanner is the source of truth for the current basket
    session.lastScanData = cleanTagIds;
    session.lastScanStatus =
      cleanTagIds.length === 0
        ? 'IDLE'
        : status === 'SCANNING'
          ? 'SCANNING'
          : 'STABLE';
    session.lastCapturedAt = now;
    await session.save();

    let result: Record<string, unknown>;
    switch (session.currentMode) {
      case DeviceMode.ADD:
        result = await this.processAdd(
          cleanTagIds,
          session.activeProductId?.toString(),
        );
        break;
      case DeviceMode.CHECK:
        result = await this.processCheck(cleanTagIds);
        break;
      case DeviceMode.CHECKOUT:
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

  async simulateDevProduct(deviceId: string, productId: string) {
    if (process.env.ENV !== 'dev') throw new BadRequestException('Development simulator is disabled');
    if (!deviceId?.trim() || !Types.ObjectId.isValid(productId)) throw new BadRequestException('Valid deviceId and productId are required');
    const product = await this.productModel.findById(productId);
    if (!product) throw new BadRequestException('Product not found');
    const session = await this.getOrCreateSession(deviceId);
    const currentTagIds = this.normalizeTagIds(session.lastScanData);
    const tagId = `DEV-${randomUUID()}`;
    await new this.tagModel({ tagId, productId: new Types.ObjectId(productId), status: TagStatus.AVAILABLE }).save();
    await this.handleCapture(deviceId, [...currentTagIds, tagId], 'STABLE');
    return { tagId, productId: String(product._id), name: product.name };
  }

  async clearSession(deviceId: string) {
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

  async getSnapshot(deviceId: string) {
    const session = await this.getOrCreateSession(deviceId);
    const tagIds = this.normalizeTagIds(session.lastScanData);
    let result: SnapshotResult = { items: [], totalPrice: 0, tagIds };

    if ((session.currentMode === DeviceMode.CHECKOUT || session.currentMode === DeviceMode.PAYMENT) && tagIds.length > 0) {
      result = await this.processCheckout(tagIds);
    } else if (session.currentMode === DeviceMode.CHECK) {
      result = await this.processCheck(tagIds);
    }

    return {
      deviceId,
      mode: session.currentMode,
      tagIds,
      lastCapturedAt: session.lastCapturedAt,
      status:
        tagIds.length > 0
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

  private async processAdd(tagIds: string[], productId?: string) {
    if (!productId) return { error: 'No active product selected for ADD mode' };

    const results = { added: 0, skipped: 0, warnings: [] as string[] };
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

  private async processCheck(tagIds: string[]) {
    const tags = await this.tagModel
      .find({ tagId: { $in: tagIds } })
      .populate<{ productId: Product | null }>('productId');
    const foundIds = tags.map((t) => t.tagId);
    const unknown = tagIds.filter((id) => !foundIds.includes(id));
    return {
      tagIds,
      found: tags,
      unknownCount: unknown.length,
      unknownTagIds: unknown,
    };
  }

  private async processCheckout(tagIds: string[]) {
    const tags = await this.tagModel
      .find({ tagId: { $in: tagIds } })
      .populate<{ productId: Product | null }>('productId');

    let totalPrice = 0;
    const summary = new Map<
      string,
      { name: string; imageUrl?: string; count: number; subtotal: number }
    >();
    const acceptedTagIds: string[] = [];
    const unavailableTagIds: string[] = [];
    const unknownTagIds = tagIds.filter(
      (id) => !tags.some((tag) => tag.tagId === id),
    );

    for (const tag of tags) {
      const product = tag.productId;
      // Demo mode does not consume stock at checkout. A tag remains usable
      // even if an older JSON record already has status = sold.
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
      transactionId: new Types.ObjectId().toHexString(),
      items: Array.from(summary.values()),
      totalPrice,
      tagIds: acceptedTagIds,
      scannedTagIds: tagIds,
      unknownTagIds,
      unavailableTagIds,
    };
  }
}
