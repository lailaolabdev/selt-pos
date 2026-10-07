"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("crypto");
const util_1 = require("util");
const admin_user_schema_1 = require("./schemas/admin-user.schema");
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
let AuthService = class AuthService {
    adminModel;
    tokenSecret = process.env.ADMIN_TOKEN_SECRET || '4b-easy-pos-dev-secret-change-me';
    tokenTtlSeconds = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 60 * 60 * 24);
    constructor(adminModel) {
        this.adminModel = adminModel;
    }
    async onModuleInit() {
        await this.ensureDefaultAdmin();
    }
    async login(username, password) {
        const normalizedUsername = username.trim().toLowerCase();
        const admin = await this.adminModel.findOne({ username: normalizedUsername }).exec();
        if (!admin || !(await this.verifyPassword(password, admin.passwordHash))) {
            throw new common_1.UnauthorizedException('Invalid admin username or password');
        }
        const accessToken = this.signToken({
            sub: String(admin._id),
            username: admin.username,
            role: admin.role,
            exp: Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
        });
        return {
            accessToken,
            expiresIn: this.tokenTtlSeconds,
            admin: this.toProfile(admin),
        };
    }
    async verifyToken(accessToken) {
        const payload = this.decodeAndVerifyToken(accessToken);
        const admin = await this.adminModel.findById(payload.sub).exec();
        if (!admin || admin.username !== payload.username || admin.role !== payload.role) {
            throw new common_1.UnauthorizedException('Invalid admin token');
        }
        return this.toProfile(admin);
    }
    async ensureDefaultAdmin() {
        const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD || 'admin';
        const displayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator';
        const existing = await this.adminModel.findOne({ username }).exec();
        if (existing) {
            return;
        }
        await new this.adminModel({
            username,
            passwordHash: await this.hashPassword(password),
            displayName,
            role: 'admin',
        }).save();
        console.log(`[Auth] Created default admin account: ${username}`);
    }
    async hashPassword(password) {
        const salt = (0, crypto_1.randomBytes)(16).toString('hex');
        const key = (await scrypt(password, salt, 64));
        return `scrypt:${salt}:${key.toString('hex')}`;
    }
    async verifyPassword(password, passwordHash) {
        const [algorithm, salt, storedKey] = passwordHash.split(':');
        if (algorithm !== 'scrypt' || !salt || !storedKey) {
            return false;
        }
        const key = (await scrypt(password, salt, 64));
        const storedBuffer = Buffer.from(storedKey, 'hex');
        if (storedBuffer.length !== key.length) {
            return false;
        }
        return (0, crypto_1.timingSafeEqual)(storedBuffer, key);
    }
    signToken(payload) {
        const encodedPayload = this.base64Url(JSON.stringify(payload));
        const signature = this.sign(encodedPayload);
        return `${encodedPayload}.${signature}`;
    }
    decodeAndVerifyToken(accessToken) {
        const [encodedPayload, signature] = accessToken.split('.');
        if (!encodedPayload || !signature || this.sign(encodedPayload) !== signature) {
            throw new common_1.UnauthorizedException('Invalid admin token');
        }
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (!payload.sub || !payload.username || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
            throw new common_1.UnauthorizedException('Expired admin token');
        }
        return payload;
    }
    sign(value) {
        return (0, crypto_1.createHmac)('sha256', this.tokenSecret).update(value).digest('base64url');
    }
    base64Url(value) {
        return Buffer.from(value).toString('base64url');
    }
    toProfile(admin) {
        return {
            id: String(admin._id),
            username: admin.username,
            displayName: admin.displayName,
            role: admin.role,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(admin_user_schema_1.AdminUser.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AuthService);
//# sourceMappingURL=auth.service.js.map