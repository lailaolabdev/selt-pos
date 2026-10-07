"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const mongoose_1 = require("@nestjs/mongoose");
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const app_module_1 = require("../app.module");
const admin_user_schema_1 = require("../auth/schemas/admin-user.schema");
const env_1 = require("../env");
(0, env_1.loadEnvFile)();
const scrypt = (0, node_util_1.promisify)(node_crypto_1.scrypt);
async function main() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: false,
    });
    try {
        const model = app.get((0, mongoose_1.getModelToken)(admin_user_schema_1.AdminUser.name));
        const username = (process.env.ADMIN_USERNAME || 'admin')
            .trim()
            .toLowerCase();
        const existing = await model.findOne({ username }).exec();
        if (existing && process.env.ADMIN_RESET_PASSWORD === 'true') {
            const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
            const key = (await scrypt(process.env.ADMIN_PASSWORD || 'admin', salt, 64));
            existing.passwordHash = `scrypt:${salt}:${key.toString('hex')}`;
            existing.displayName = process.env.ADMIN_DISPLAY_NAME || 'Administrator';
            await existing.save();
            console.log(`[seed:admin] Reset account: ${username}`);
        }
        else
            console.log(`[seed:admin] Account ready: ${username}`);
    }
    finally {
        await app.close();
    }
}
main().catch((error) => {
    console.error('[seed:admin] Failed', error);
    process.exitCode = 1;
});
//# sourceMappingURL=seed-admin.js.map