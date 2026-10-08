import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export declare enum DeviceMode {
    IDLE = "IDLE",
    ADD = "ADD",
    CHECK = "CHECK",
    CHECKOUT = "CHECKOUT",
    PAYMENT = "PAYMENT"
}
export declare class DeviceSession extends Document {
    deviceId: string;
    currentMode: DeviceMode;
    activeProductId?: Types.ObjectId;
    lastScanData: string[];
    lastScanStatus: string;
    lastCapturedAt?: Date;
    currentBasketId?: string;
    lastBasketKey?: string;
    lastBasketSeenAt?: Date;
}
export declare const DeviceSessionSchema: MongooseSchema<DeviceSession, import("mongoose").Model<DeviceSession, any, any, any, (Document<unknown, any, DeviceSession, any, import("mongoose").DefaultSchemaOptions> & DeviceSession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, DeviceSession, any, import("mongoose").DefaultSchemaOptions> & DeviceSession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}), any, DeviceSession>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, DeviceSession, Document<unknown, {}, DeviceSession, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    _id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    deviceId?: import("mongoose").SchemaDefinitionProperty<string, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    currentMode?: import("mongoose").SchemaDefinitionProperty<DeviceMode, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    activeProductId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastScanData?: import("mongoose").SchemaDefinitionProperty<string[], DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastScanStatus?: import("mongoose").SchemaDefinitionProperty<string, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastCapturedAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    currentBasketId?: import("mongoose").SchemaDefinitionProperty<string | undefined, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastBasketKey?: import("mongoose").SchemaDefinitionProperty<string | undefined, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastBasketSeenAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, DeviceSession, Document<unknown, {}, DeviceSession, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DeviceSession & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, DeviceSession>;
