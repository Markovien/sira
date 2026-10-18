import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { StopsImportService } from './stops-import.service';

@Module({
  controllers: [MissionsController],
  providers: [MissionsService, StopsImportService],
  exports: [MissionsService, StopsImportService],
})
export class MissionsModule {}
