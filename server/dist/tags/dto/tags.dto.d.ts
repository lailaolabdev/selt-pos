export declare enum ScannerStatusDto {
    IDLE = "IDLE",
    SCANNING = "SCANNING",
    STABLE = "STABLE"
}
export declare enum TagSyncModeDto {
    ADD = "add",
    CHECK = "check",
    CHECKOUT = "checkout",
    REPLACE = "replace"
}
export declare class CaptureTagsDto {
    deviceId: string;
    tagIds: string[];
    status?: ScannerStatusDto;
}
export declare class SyncTagsDto {
    deviceId: string;
    tagIds: string[];
    mode: TagSyncModeDto;
    productId?: string;
}
export declare class ConfirmSaleDto {
    transactionId: string;
    tagIds: string[];
}
