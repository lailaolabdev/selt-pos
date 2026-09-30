import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsGateway } from './sessions.gateway';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [],
  providers: [SessionsService, SessionsGateway],
  controllers: [SessionsController],
  exports: [SessionsService, SessionsGateway],
})
export class SessionsModule {}
