import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PaymentProvider {
  PHAJAY = 'phajay',
  BIO = 'bio',
}

export enum PaymentStatus {
  WAITING = 'WAITING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class PaymentTransaction extends Document {
  @Prop({ required: true, unique: true })
  orderNo: string;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [Object], default: [] })
  items: Record<string, any>[];

  @Prop({ type: [String], default: [] })
  tagIds: string[];

  @Prop({ type: String, enum: Object.values(PaymentProvider), default: PaymentProvider.PHAJAY })
  provider: PaymentProvider;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.WAITING })
  status: PaymentStatus;

  @Prop()
  redirectURL?: string;

  @Prop()
  qrCode?: string;

  @Prop()
  paymentLink?: string;

  @Prop()
  bank?: string;

  @Prop()
  linkCode?: string;

  @Prop()
  providerTransactionId?: string;

  @Prop()
  providerIntentId?: string;

  @Prop()
  expiresAt?: Date;

  @Prop()
  paymentMethod?: string;

  @Prop({ type: [Object], default: [] })
  webhookPayloads: Record<string, any>[];

  @Prop()
  paidAt?: Date;
}

export const PaymentTransactionSchema = SchemaFactory.createForClass(PaymentTransaction);
