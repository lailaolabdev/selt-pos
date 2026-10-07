"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_DEFINITIONS = void 0;
const product_schema_1 = require("../products/schemas/product.schema");
const tag_schema_1 = require("../tags/schemas/tag.schema");
const session_schema_1 = require("../sessions/schemas/session.schema");
const payment_transaction_schema_1 = require("../payments/schemas/payment-transaction.schema");
const admin_user_schema_1 = require("../auth/schemas/admin-user.schema");
exports.MODEL_DEFINITIONS = [
    {
        name: product_schema_1.Product.name,
        schema: product_schema_1.ProductSchema,
        collection: 'products',
        unique: ['sku'],
    },
    {
        name: tag_schema_1.RFIDTag.name,
        schema: tag_schema_1.RFIDTagSchema,
        collection: 'tags',
        unique: ['tagId'],
    },
    {
        name: session_schema_1.DeviceSession.name,
        schema: session_schema_1.DeviceSessionSchema,
        collection: 'sessions',
        unique: ['deviceId'],
    },
    {
        name: payment_transaction_schema_1.PaymentTransaction.name,
        schema: payment_transaction_schema_1.PaymentTransactionSchema,
        collection: 'payments',
        unique: ['orderNo'],
    },
    {
        name: admin_user_schema_1.AdminUser.name,
        schema: admin_user_schema_1.AdminUserSchema,
        collection: 'admins',
        unique: ['username'],
    },
];
//# sourceMappingURL=model-definitions.js.map