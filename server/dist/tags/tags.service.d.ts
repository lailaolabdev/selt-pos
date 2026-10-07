import { Model, Types } from 'mongoose';
import { RFIDTag } from './schemas/tag.schema';
import { Product } from '../products/schemas/product.schema';
export declare class TagsService {
    private tagModel;
    private productModel;
    constructor(tagModel: Model<RFIDTag>, productModel: Model<Product>);
    sync(data: {
        deviceId: string;
        tagIds: string | string[];
        mode: 'add' | 'check' | 'checkout' | 'replace';
        productId?: string;
    }): Promise<{
        added: number;
        skipped: number;
        warnings: string[];
    } | {
        found: (import("mongoose").Document<unknown, {}, import("mongoose").MergeType<RFIDTag, {
            productId: Product | null;
        }>, {}, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag, "productId"> & {
            productId: Product | null;
        } & Required<{
            _id: Types.ObjectId;
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
    private handleAdd;
    private handleReplace;
    findByProductId(productId: string): Promise<(import("mongoose").Document<unknown, {}, RFIDTag, {}, import("mongoose").DefaultSchemaOptions> & RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    findExistingTagIds(tagIds: string[]): Promise<{
        tagId: string;
        productId: string;
    }[]>;
    private handleCheck;
    private handleCheckout;
    confirmSale(transactionId: string, tagIds: string[]): Promise<{
        message: string;
        updatedCount: number;
    }>;
    getInventorySummary(): Promise<{
        productId: string;
        name: string;
        sku: string;
        availableCount: number;
    }[]>;
}
