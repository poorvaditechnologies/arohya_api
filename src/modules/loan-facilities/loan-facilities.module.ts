import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoanFacilitiesController } from './loan-facilities.controller';
import { LoanFacilitiesService } from './loan-facilities.service';

@Module({
  imports: [AuthModule],
  controllers: [LoanFacilitiesController],
  providers: [LoanFacilitiesService],
})
export class LoanFacilitiesModule {}
