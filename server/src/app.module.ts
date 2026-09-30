import { Module } from '@nestjs/common';
import { StorageModule } from './storage/storage.module';
import { ProductsModule } from './products/products.module';
import { TagsModule } from './tags/tags.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';
import { VoiceModule } from './voice/voice.module';
import { PaymentsModule } from './payments/payments.module';
import { loadEnvFile } from './env';

loadEnvFile();

@Module({
  imports: [
    StorageModule,
    AuthModule,
    ProductsModule,
    TagsModule,
    SessionsModule,
    VoiceModule,
    PaymentsModule,
  ],
})
export class AppModule {}
