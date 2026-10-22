import { Module } from '@nestjs/common';
import { FinancingSolutionsController } from './financing-solutions.controller';
import { FinancingSolutionsService } from './financing-solutions.service';

@Module({
  controllers: [FinancingSolutionsController],
  providers: [FinancingSolutionsService],
  exports: [FinancingSolutionsService],
})
export class FinancingSolutionsModule {}
