import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AdminUser } from '../auth/schemas/admin-user.schema';
import { loadEnvFile } from '../env';

loadEnvFile();
const scrypt = promisify(scryptCallback);
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const model = app.get<Model<AdminUser>>(getModelToken(AdminUser.name));
    const username = (process.env.ADMIN_USERNAME || 'admin')
      .trim()
      .toLowerCase();
    const existing = await model.findOne({ username }).exec();
    if (existing && process.env.ADMIN_RESET_PASSWORD === 'true') {
      const salt = randomBytes(16).toString('hex');
      const key = (await scrypt(
        process.env.ADMIN_PASSWORD || 'admin',
        salt,
        64,
      )) as Buffer;
      existing.passwordHash = `scrypt:${salt}:${key.toString('hex')}`;
      existing.displayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator';
      await existing.save();
      console.log(`[seed:admin] Reset account: ${username}`);
    } else console.log(`[seed:admin] Account ready: ${username}`);
  } finally {
    await app.close();
  }
}
main().catch((error: unknown) => {
  console.error('[seed:admin] Failed', error);
  process.exitCode = 1;
});
