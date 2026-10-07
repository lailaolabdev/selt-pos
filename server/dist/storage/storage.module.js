"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageModule = exports.STORAGE_DRIVER = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const env_1 = require("../env");
const json_store_1 = require("./json-store");
const json_model_1 = require("./json-model");
const model_definitions_1 = require("./model-definitions");
(0, env_1.loadEnvFile)();
exports.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'json';
if (!['json', 'mongo'].includes(exports.STORAGE_DRIVER))
    throw new Error('STORAGE_DRIVER must be json or mongo');
const modelTokens = model_definitions_1.MODEL_DEFINITIONS.map((definition) => (0, mongoose_1.getModelToken)(definition.name));
const jsonProviders = [
    {
        provide: json_store_1.JsonStore,
        useFactory: () => {
            const store = new json_store_1.JsonStore();
            common_1.Logger.log(`JSON storage: ${store.file} (MongoDB disabled)`, 'Storage');
            return store;
        },
    },
    {
        provide: 'JSON_MODELS',
        inject: [json_store_1.JsonStore],
        useFactory: (store) => (0, json_model_1.createJsonModels)(store, model_definitions_1.MODEL_DEFINITIONS),
    },
    ...model_definitions_1.MODEL_DEFINITIONS.map((definition) => ({
        provide: (0, mongoose_1.getModelToken)(definition.name),
        inject: ['JSON_MODELS'],
        useFactory: (models) => models.get(definition.name),
    })),
];
let StorageModule = class StorageModule {
};
exports.StorageModule = StorageModule;
exports.StorageModule = StorageModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: exports.STORAGE_DRIVER === 'mongo'
            ? [
                mongoose_1.MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/pos_rfid'),
                mongoose_1.MongooseModule.forFeature(model_definitions_1.MODEL_DEFINITIONS.map(({ name, schema }) => ({ name, schema }))),
            ]
            : [],
        providers: exports.STORAGE_DRIVER === 'json' ? jsonProviders : [],
        exports: exports.STORAGE_DRIVER === 'json' ? [json_store_1.JsonStore, ...modelTokens] : [mongoose_1.MongooseModule],
    })
], StorageModule);
//# sourceMappingURL=storage.module.js.map