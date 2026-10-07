import { Document, Types } from 'mongoose';
export declare enum TagStatus {
    AVAILABLE = "available",
    SOLD = "sold",
    DAMAGED = "damaged"
}
export declare class RFIDTag extends Document {
    tagId: string;
    productId: Types.ObjectId;
    status: TagStatus;
    lastSeenAt: Date;
    metadata: Record<string, any>;
}
export declare const RFIDTagSchema: import("mongoose").Schema<RFIDTag, import("mongoose").Model<RFIDTag, any, any, any, (Document<unknown, any, RFIDTag, any, import("mongoose").DefaultSchemaOptions> & RFIDTag & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, RFIDTag, any, import("mongoose").DefaultSchemaOptions> & RFIDTag & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}), any, RFIDTag>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, RFIDTag, Document<unknown, {}, RFIDTag, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    _id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    tagId?: import("mongoose").SchemaDefinitionProperty<string, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    productId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<TagStatus, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    lastSeenAt?: import("mongoose").SchemaDefinitionProperty<Date, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    metadata?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, RFIDTag, Document<unknown, {}, RFIDTag, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<RFIDTag & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, RFIDTag>;
