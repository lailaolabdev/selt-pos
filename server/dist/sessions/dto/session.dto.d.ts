import { DeviceMode } from '../schemas/session.schema';
export declare class SetModeDto {
    deviceId: string;
    mode: DeviceMode;
    productId?: string;
}
export declare class ClearSessionDto {
    deviceId: string;
}
