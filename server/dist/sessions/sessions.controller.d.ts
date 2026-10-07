import { SessionsService } from './sessions.service';
import { ClearSessionDto, SetModeDto } from './dto/session.dto';
export declare class SessionsController {
    private readonly sessionsService;
    constructor(sessionsService: SessionsService);
    setMode(data: SetModeDto): Promise<import("./schemas/session.schema").DeviceSession>;
    clear(data: ClearSessionDto): Promise<{
        message: string;
    }>;
    snapshot(deviceId: string): Promise<{
        deviceId: string;
        mode: import("./schemas/session.schema").DeviceMode;
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
}
