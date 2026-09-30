import { Product, ProductSchema } from '../products/schemas/product.schema';
import { RFIDTag, RFIDTagSchema } from '../tags/schemas/tag.schema';
import {
  DeviceSession,
  DeviceSessionSchema,
} from '../sessions/schemas/session.schema';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payments/schemas/payment-transaction.schema';
import { AdminUser, AdminUserSchema } from '../auth/schemas/admin-user.schema';
import { ModelDefinition } from './json-model';
export const MODEL_DEFINITIONS: ModelDefinition[] = [
  {
    name: Product.name,
    schema: ProductSchema,
    collection: 'products',
    unique: ['sku'],
  },
  {
    name: RFIDTag.name,
    schema: RFIDTagSchema,
    collection: 'tags',
    unique: ['tagId'],
  },
  {
    name: DeviceSession.name,
    schema: DeviceSessionSchema,
    collection: 'sessions',
    unique: ['deviceId'],
  },
  {
    name: PaymentTransaction.name,
    schema: PaymentTransactionSchema,
    collection: 'payments',
    unique: ['orderNo'],
  },
  {
    name: AdminUser.name,
    schema: AdminUserSchema,
    collection: 'admins',
    unique: ['username'],
  },
];
