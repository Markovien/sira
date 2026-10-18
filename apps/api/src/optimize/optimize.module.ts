import { Module } from '@nestjs/common';
import { MissionsModule } from '../missions/missions.module';
import { RoutingModule } from '../routing/routing.module';
import { OptimizeController } from './optimize.controller';
import { OptimizeService } from './optimize.service';
import { VrpSolverService } from './vrp-solver.service';

@Module({
  imports: [MissionsModule, RoutingModule],
  controllers: [OptimizeController],
  providers: [OptimizeService, VrpSolverService],
})
export class OptimizeModule {}
