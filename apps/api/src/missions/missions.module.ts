import { Module } from '@nestjs/common';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { StopsImportService } from './stops-import.service';

@Module({
  imports: [GeocodingModule],
  controllers: [MissionsController],
  providers: [MissionsService, StopsImportService],
  exports: [MissionsService, StopsImportService],
})
export class MissionsModule {}
