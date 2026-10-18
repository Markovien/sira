import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  geocodeNearbySchema,
  geocodeSearchSchema,
  type AccessTokenPayload,
  type GeocodeNearbyQuery,
  type GeocodeSearchQuery,
} from '@sira/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocodage')
@ApiBearerAuth()
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Recherche une adresse',
    description:
      "Interroge Photon et la base d'adresses proprietaire. Les adresses confirmees par une livraison passent devant : une position verifiee sur le terrain vaut mieux qu'une correspondance OpenStreetMap plausible. `photonAvailable` a false signale un geocodage degrade, a distinguer d'une absence de resultat.",
  })
  @ApiResponse({ status: 200, description: 'Candidats, source indiquee par resultat' })
  search(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(geocodeSearchSchema)) query: GeocodeSearchQuery,
  ) {
    return this.geocoding.search(user.organizationId, query.q, query.limit);
  }

  // POST pour ne pas exposer des coordonnees de livraison dans une URL, mais
  // 200 et non 201 : cette route interroge, elle ne cree rien.
  @Post('nearby')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adresses deja connues autour d un point',
    description:
      "Sert la saisie par appui long sur la carte : si le livreur a deja livre ici, l'adresse remonte avec sa description informelle.",
  })
  nearby(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(geocodeNearbySchema)) body: GeocodeNearbyQuery,
  ) {
    return this.geocoding.nearby(user.organizationId, body, body.radiusMeters);
  }
}
