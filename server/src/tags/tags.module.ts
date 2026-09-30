import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagsController, InventoryController } from './tags.controller';
import { ProductsModule } from '../products/products.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ProductsModule, SessionsModule],
  providers: [TagsService],
  controllers: [TagsController, InventoryController],
  exports: [TagsService],
})
export class TagsModule {}
