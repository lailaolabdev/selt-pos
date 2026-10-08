import { Model } from 'mongoose';
import { DeviceSession, DeviceMode } from './schemas/session.schema';
import { RFIDTag } from '../tags/schemas/tag.schema';
import { Product } from '../products/schemas/product.schema';
import { SessionsGateway } from './sessions.gateway';
export declare class SessionsService {
    private sessionModel;
    private tagModel;
    private productModel;
    private readonly gateway;
    constructor(sessionModel: Model<DeviceSession>, tagModel: Model<RFIDTag>, productModel: Model<Product>, gateway: SessionsGateway);
    getOrCreateSession(deviceId: string): Promise<DeviceSession>;
    setMode(deviceId: string, mode: DeviceMode, productId?: string): Promise<DeviceSession>;
    private normalizeTagIds;
    private makeBasketKey;
    handleCapture(deviceId: string, tagIds: unknown, status?: string): Promise<Record<string, unknown> | {
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
    simulateDevProduct(deviceId: string, productId: string): Promise<{
        tagId: string;
        productId: string;
        name: string;
    }>;
    clearSession(deviceId: string): Promise<{
        message: string;
    }>;
    getSnapshot(deviceId: string): Promise<{
        deviceId: string;
        mode: DeviceMode;
        tagIds: string[];
        lastCapturedAt: Date | undefined;
        status: string;
        basketId: string | undefined;
        basketKey: string;
        result: {
            basketId: string | undefined;
            basketKey: string;
            items?: {
                name: string;
                imageUrl?: string;
                count: number;
                subtotal: number;
            }[];
            totalPrice?: number;
            tagIds: string[];
        };
    }>;
    private processAdd;
    private processCheck;
    private processCheckout;
}
