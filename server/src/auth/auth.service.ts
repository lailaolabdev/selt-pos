import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { AdminUser } from './schemas/admin-user.schema';

const scrypt = promisify(scryptCallback);

interface AdminTokenPayload {
  sub: string;
  username: string;
  role: string;
  exp: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly tokenSecret = process.env.ADMIN_TOKEN_SECRET || '4b-easy-pos-dev-secret-change-me';
  private readonly tokenTtlSeconds = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 60 * 60 * 24);

  constructor(@InjectModel(AdminUser.name) private adminModel: Model<AdminUser>) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  async login(username: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const admin = await this.adminModel.findOne({ username: normalizedUsername }).exec();

    if (!admin || !(await this.verifyPassword(password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid admin username or password');
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

  async verifyToken(accessToken: string) {
    const payload = this.decodeAndVerifyToken(accessToken);
    const admin = await this.adminModel.findById(payload.sub).exec();

    if (!admin || admin.username !== payload.username || admin.role !== payload.role) {
      throw new UnauthorizedException('Invalid admin token');
    }

    return this.toProfile(admin);
  }

  private async ensureDefaultAdmin() {
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

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const key = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt:${salt}:${key.toString('hex')}`;
  }

  private async verifyPassword(password: string, passwordHash: string) {
    const [algorithm, salt, storedKey] = passwordHash.split(':');
    if (algorithm !== 'scrypt' || !salt || !storedKey) {
      return false;
    }

    const key = (await scrypt(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(storedKey, 'hex');

    if (storedBuffer.length !== key.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, key);
  }

  private signToken(payload: AdminTokenPayload) {
    const encodedPayload = this.base64Url(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  private decodeAndVerifyToken(accessToken: string): AdminTokenPayload {
    const [encodedPayload, signature] = accessToken.split('.');
    if (!encodedPayload || !signature || this.sign(encodedPayload) !== signature) {
      throw new UnauthorizedException('Invalid admin token');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminTokenPayload;
    if (!payload.sub || !payload.username || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Expired admin token');
    }

    return payload;
  }

  private sign(value: string) {
    return createHmac('sha256', this.tokenSecret).update(value).digest('base64url');
  }

  private base64Url(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private toProfile(admin: AdminUser) {
    return {
      id: String(admin._id),
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
    };
  }
}
