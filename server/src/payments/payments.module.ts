import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { TagsModule } from '../tags/tags.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [SessionsModule, TagsModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
