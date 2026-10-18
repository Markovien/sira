import { Module } from '@nestjs/common';
import { OsrmService } from './osrm.service';
import { RoutingController } from './routing.controller';

@Module({
  controllers: [RoutingController],
  providers: [OsrmService],
  // Exporte : la Phase 2 en aura besoin pour POST /missions/:id/optimize.
  exports: [OsrmService],
})
export class RoutingModule {}
