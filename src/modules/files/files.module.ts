import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, StorageService],
  exports: [FilesService],
})
export class FilesModule {}
