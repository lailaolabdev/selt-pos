import { TagsService } from './tags.service';
import { SessionsService } from '../sessions/sessions.service';
import { CaptureTagsDto, ConfirmSaleDto, SyncTagsDto } from './dto/tags.dto';
export declare class TagsController {
    private readonly tagsService;
    private readonly sessionsService;
    constructor(tagsService: TagsService, sessionsService: SessionsService);
    capture(data: CaptureTagsDto): Promise<Record<string, unknown> | {
        transactionId: string;
        items: {
            name: string;
            imageUrl?: string;
            count: number;
            subtotal: number;
        }[];
        totalPrice: number;
        tagIds: string[];
        scannedTagIds: string[];
        unknownTagIds: string[];
        unavailableTagIds: string[];
    }>;
    captureDevProduct(data: {
        deviceId: string;
        productId: string;
    }): Promise<{
        tagId: string;
        productId: string;
        name: string;
    }>;
    sync(data: SyncTagsDto): Promise<{
        added: number;
        skipped: number;
        warnings: string[];
    } | {
        found: (import("mongoose").Document<unknown, {}, import("mongoose").MergeType<import("./schemas/tag.schema").RFIDTag, {
            productId: import("../products/schemas/product.schema").Product | null;
        }>, {}, import("mongoose").DefaultSchemaOptions> & Omit<import("./schemas/tag.schema").RFIDTag, "productId"> & {
            productId: import("../products/schemas/product.schema").Product | null;
        } & Required<{
            _id: import("mongoose").Types.ObjectId;
        }> & {
            __v: number;
        } & {
            id: string;
        })[];
        unknownCount: number;
        unknownTagIds: string[];
    } | {
        transactionId: string;
        items: {
            name: string;
            imageUrl?: string;
            count: number;
            subtotal: number;
        }[];
        totalPrice: number;
        tagIds: string[];
        unavailableCount: number;
    }>;
    checkDuplicates(data: {
        tagIds?: string[];
    }): Promise<{
        duplicates: {
            tagId: string;
            productId: string;
        }[];
    }>;
    confirmSale(data: ConfirmSaleDto): Promise<{
        message: string;
        updatedCount: number;
    }>;
    findByProductId(productId: string): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/tag.schema").RFIDTag, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/tag.schema").RFIDTag & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
}
export declare class InventoryController {
    private readonly tagsService;
    constructor(tagsService: TagsService);
    getSummary(): Promise<{
        productId: string;
        name: string;
        sku: string;
        availableCount: number;
    }[]>;
}
