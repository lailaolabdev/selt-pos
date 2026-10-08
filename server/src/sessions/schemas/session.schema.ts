import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum DeviceMode {
  IDLE = 'IDLE',
  ADD = 'ADD',
  CHECK = 'CHECK',
  CHECKOUT = 'CHECKOUT',
  PAYMENT = 'PAYMENT',
}

@Schema({ timestamps: true })
export class DeviceSession extends Document {
  @Prop({ required: true, unique: true })
  deviceId: string;

  @Prop({
    type: String,
    enum: Object.values(DeviceMode),
    default: DeviceMode.IDLE,
  })
  currentMode: DeviceMode;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  activeProductId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  lastScanData: string[];

  @Prop({ enum: ['IDLE', 'SCANNING', 'STABLE'], default: 'IDLE' })
  lastScanStatus: string;

  @Prop()
  lastCapturedAt?: Date;

  @Prop()
  currentBasketId?: string;

  @Prop()
  lastBasketKey?: string;

  @Prop()
  lastBasketSeenAt?: Date;
}

export const DeviceSessionSchema = SchemaFactory.createForClass(DeviceSession);
