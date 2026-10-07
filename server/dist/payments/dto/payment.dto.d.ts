export declare class CreatePhaJayPaymentLinkDto {
    deviceId: string;
}
export declare const PHAJAY_QR_BANKS: readonly ["bcel", "jdb", "ldb", "ib", "stb", "m-money"];
export type PhaJayQrBank = (typeof PHAJAY_QR_BANKS)[number];
export declare class CreatePhaJayQrDto extends CreatePhaJayPaymentLinkDto {
    bank?: PhaJayQrBank;
}
