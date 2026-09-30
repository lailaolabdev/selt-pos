import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TagStatus {
  AVAILABLE = 'available',
  SOLD = 'sold',
  DAMAGED = 'damaged',
}

@Schema({ timestamps: true })
export class RFIDTag extends Document {
  @Prop({ required: true, unique: true })
  tagId: string;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TagStatus), default: TagStatus.AVAILABLE })
  status: TagStatus;

  @Prop({ default: Date.now })
  lastSeenAt: Date;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const RFIDTagSchema = SchemaFactory.createForClass(RFIDTag);
