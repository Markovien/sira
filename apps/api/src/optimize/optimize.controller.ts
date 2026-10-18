import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  optimizeRequestSchema,
  type AccessTokenPayload,
  type OptimizeRequest,
} from '@sira/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OptimizeService } from './optimize.service';

@ApiTags('missions')
@ApiBearerAuth()
@Controller('missions')
export class OptimizeController {
  constructor(private readonly optimizer: OptimizeService) {}

  // Optimiser, c'est planifier : reserve au dispatcheur et a l administrateur.
  @Roles('dispatcher', 'admin')
  @Post(':id/optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calcule l ordre de passage optimal et les heures d arrivee',
    description:
      'Un seul vehicule route vers le solveur TSP embarque ; plusieurs declenchent le solveur VRP et scindent la mission en une tournee par vehicule. Les arrets qu aucun vehicule ne peut servir sont rendus explicitement plutot que silencieusement omis.',
  })
  @ApiResponse({ status: 200, description: 'Ordre et ETA persistes' })
  @ApiResponse({ status: 400, description: 'Moins de deux arrets, ou flotte sans depot' })
  @ApiResponse({
    status: 503,
    description: 'Service de routage ou d optimisation indisponible',
  })
  optimize(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') missionId: string,
    @Body(new ZodValidationPipe(optimizeRequestSchema)) dto: OptimizeRequest,
  ) {
    const departureSeconds = dto.departureTime ? toSeconds(dto.departureTime) : undefined;
    return this.optimizer.optimize(user.organizationId, missionId, {
      ...(dto.vehicleIds ? { vehicleIds: dto.vehicleIds } : {}),
      ...(dto.timeLimitMs ? { timeLimitMs: dto.timeLimitMs } : {}),
      ...(departureSeconds !== undefined ? { departureSeconds } : {}),
    });
  }
}

function toSeconds(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60;
}
