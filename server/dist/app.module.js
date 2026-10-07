"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const storage_module_1 = require("./storage/storage.module");
const products_module_1 = require("./products/products.module");
const tags_module_1 = require("./tags/tags.module");
const sessions_module_1 = require("./sessions/sessions.module");
const auth_module_1 = require("./auth/auth.module");
const voice_module_1 = require("./voice/voice.module");
const payments_module_1 = require("./payments/payments.module");
const env_1 = require("./env");
(0, env_1.loadEnvFile)();
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            storage_module_1.StorageModule,
            auth_module_1.AuthModule,
            products_module_1.ProductsModule,
            tags_module_1.TagsModule,
            sessions_module_1.SessionsModule,
            voice_module_1.VoiceModule,
            payments_module_1.PaymentsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map