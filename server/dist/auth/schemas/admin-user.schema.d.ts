import { Document } from 'mongoose';
export declare class AdminUser extends Document {
    username: string;
    passwordHash: string;
    displayName: string;
    role: string;
}
export declare const AdminUserSchema: import("mongoose").Schema<AdminUser, import("mongoose").Model<AdminUser, any, any, any, (Document<unknown, any, AdminUser, any, import("mongoose").DefaultSchemaOptions> & AdminUser & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, AdminUser, any, import("mongoose").DefaultSchemaOptions> & AdminUser & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}), any, AdminUser>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AdminUser, Document<unknown, {}, AdminUser, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    _id?: import("mongoose").SchemaDefinitionProperty<import("mongoose").Types.ObjectId, AdminUser, Document<unknown, {}, AdminUser, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    username?: import("mongoose").SchemaDefinitionProperty<string, AdminUser, Document<unknown, {}, AdminUser, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    passwordHash?: import("mongoose").SchemaDefinitionProperty<string, AdminUser, Document<unknown, {}, AdminUser, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    displayName?: import("mongoose").SchemaDefinitionProperty<string, AdminUser, Document<unknown, {}, AdminUser, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    role?: import("mongoose").SchemaDefinitionProperty<string, AdminUser, Document<unknown, {}, AdminUser, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AdminUser & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, AdminUser>;
