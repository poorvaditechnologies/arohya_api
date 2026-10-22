import { Global, Module } from '@nestjs/common';
import { HashService } from './hash.service';
import { IdService } from './id.service';

@Global()
@Module({
  providers: [HashService, IdService],
  exports: [HashService, IdService],
})
export class SecurityModule {}
