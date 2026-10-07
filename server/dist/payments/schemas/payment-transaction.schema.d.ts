import { Document } from 'mongoose';
export declare enum PaymentProvider {
    PHAJAY = "phajay",
    BIO = "bio"
}
export declare enum PaymentStatus {
    WAITING = "WAITING",
    PAID = "PAID",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export declare class PaymentTransaction extends Document {
    orderNo: string;
    deviceId: string;
    amount: number;
    description: string;
    items: Record<string, any>[];
    tagIds: string[];
    provider: PaymentProvider;
    status: PaymentStatus;
    redirectURL?: string;
    qrCode?: string;
    paymentLink?: string;
    bank?: string;
    linkCode?: string;
    providerTransactionId?: string;
    providerIntentId?: string;
    expiresAt?: Date;
    paymentMethod?: string;
    webhookPayloads: Record<string, any>[];
    paidAt?: Date;
}
export declare const PaymentTransactionSchema: import("mongoose").Schema<PaymentTransaction, import("mongoose").Model<PaymentTransaction, any, any, any, (Document<unknown, any, PaymentTransaction, any, import("mongoose").DefaultSchemaOptions> & PaymentTransaction & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, PaymentTransaction, any, import("mongoose").DefaultSchemaOptions> & PaymentTransaction & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}), any, PaymentTransaction>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    _id?: import("mongoose").SchemaDefinitionProperty<import("mongoose").Types.ObjectId, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<PaymentStatus, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    deviceId?: import("mongoose").SchemaDefinitionProperty<string, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    orderNo?: import("mongoose").SchemaDefinitionProperty<string, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    amount?: import("mongoose").SchemaDefinitionProperty<number, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    items?: import("mongoose").SchemaDefinitionProperty<Record<string, any>[], PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    tagIds?: import("mongoose").SchemaDefinitionProperty<string[], PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    provider?: import("mongoose").SchemaDefinitionProperty<PaymentProvider, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    redirectURL?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    qrCode?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    paymentLink?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bank?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    linkCode?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    providerTransactionId?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    providerIntentId?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    expiresAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    paymentMethod?: import("mongoose").SchemaDefinitionProperty<string | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    webhookPayloads?: import("mongoose").SchemaDefinitionProperty<Record<string, any>[], PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    paidAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, PaymentTransaction, Document<unknown, {}, PaymentTransaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PaymentTransaction & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, PaymentTransaction>;
