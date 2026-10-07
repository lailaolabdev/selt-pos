import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AdminUser } from './schemas/admin-user.schema';
export declare class AuthService implements OnModuleInit {
    private adminModel;
    private readonly tokenSecret;
    private readonly tokenTtlSeconds;
    constructor(adminModel: Model<AdminUser>);
    onModuleInit(): Promise<void>;
    login(username: string, password: string): Promise<{
        accessToken: string;
        expiresIn: number;
        admin: {
            id: string;
            username: string;
            displayName: string;
            role: string;
        };
    }>;
    verifyToken(accessToken: string): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: string;
    }>;
    private ensureDefaultAdmin;
    private hashPassword;
    private verifyPassword;
    private signToken;
    private decodeAndVerifyToken;
    private sign;
    private base64Url;
    private toProfile;
}
