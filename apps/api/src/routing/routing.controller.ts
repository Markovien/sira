import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  routeRequestSchema,
  tableRequestSchema,
  type RouteRequest,
  type TableRequest,
} from '@sira/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OsrmService } from './osrm.service';

/**
 * Expose le routage aux clients. Le mobile s'en sert quand il est connecte ;
 * hors ligne il retombe sur une estimation haversine (Phase 3.4).
 *
 * POST et non GET pour la matrice comme pour l'itineraire : jusqu'a 100 points
 * ne tiennent pas dans une URL, et les coordonnees de livraison n'ont rien a
 * faire dans les journaux d'acces d'un reverse proxy.
 */
@ApiTags('routage')
@ApiBearerAuth()
@Controller('routing')
export class RoutingController {
  constructor(private readonly osrm: OsrmService) {}

  // POST pour tenir 100 points et garder les coordonnees hors des journaux
  // d'acces, mais 200 et non 201 : ces routes interrogent, elles ne creent
  // rien. Le defaut de NestJS est trompeur pour l'appelant.
  @Post('route')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Itineraire passant par les points, dans l ordre fourni' })
  @ApiResponse({ status: 200, description: 'Itineraire trouve' })
  @ApiResponse({ status: 422, description: 'Aucun itineraire entre ces points' })
  @ApiResponse({ status: 503, description: 'Service de routage indisponible' })
  route(@Body(new ZodValidationPipe(routeRequestSchema)) dto: RouteRequest) {
    return this.osrm.route(dto.points, { geometry: dto.geometry });
  }

  @Post('table')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Matrice N x N des durees entre les points',
    description: 'Socle du solveur TSP et du solveur VRP. Maximum 100 points.',
  })
  @ApiResponse({ status: 400, description: 'Plus de 100 points demandes' })
  table(@Body(new ZodValidationPipe(tableRequestSchema)) dto: TableRequest) {
    return this.osrm.table(dto.points, { withDistances: dto.withDistances });
  }
}
