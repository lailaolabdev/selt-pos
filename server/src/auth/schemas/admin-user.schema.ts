import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AdminUser extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, default: 'Administrator' })
  displayName: string;

  @Prop({ required: true, default: 'admin' })
  role: string;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
