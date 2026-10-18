import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createMissionSchema,
  createStopSchema,
  listMissionsQuerySchema,
  updateMissionSchema,
  updateStopSchema,
  type AccessTokenPayload,
  type CreateMissionInput,
  type CreateStopInput,
  type ListMissionsQuery,
  type UpdateMissionInput,
  type UpdateStopInput,
} from '@sira/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MissionsService } from './missions.service';

@ApiTags('missions')
@ApiBearerAuth()
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste les missions de l organisation' })
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query(new ZodValidationPipe(listMissionsQuerySchema)) query: ListMissionsQuery,
  ) {
    return this.missions.list(user.organizationId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d une mission et de ses arrets, dans l ordre' })
  @ApiResponse({ status: 404, description: 'Mission introuvable dans cette organisation' })
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.missions.findOne(user.organizationId, id);
  }

  // Un livreur execute sa tournee ; il ne la planifie pas.
  @Roles('dispatcher', 'admin')
  @Post()
  @ApiOperation({ summary: 'Cree une mission' })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(createMissionSchema)) dto: CreateMissionInput,
  ) {
    return this.missions.create(user.organizationId, dto);
  }

  @Roles('dispatcher', 'admin')
  @Patch(':id')
  @ApiOperation({ summary: 'Modifie une mission' })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMissionSchema)) dto: UpdateMissionInput,
  ) {
    return this.missions.update(user.organizationId, id, dto);
  }

  @Roles('dispatcher', 'admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime une mission et ses arrets' })
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.missions.remove(user.organizationId, id);
  }

  // --- Arrets ---------------------------------------------------------------

  @Roles('dispatcher', 'admin')
  @Post(':id/stops')
  @ApiOperation({ summary: 'Ajoute un arret a une mission' })
  addStop(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') missionId: string,
    @Body(new ZodValidationPipe(createStopSchema)) dto: CreateStopInput,
  ) {
    return this.missions.addStop(user.organizationId, missionId, dto);
  }

  /**
   * Ouvert au livreur : c'est par cette route qu'il marque un arret livre,
   * echoue ou reporte pendant sa tournee.
   */
  @Patch(':id/stops/:stopId')
  @ApiOperation({ summary: 'Modifie un arret ou change son statut' })
  updateStop(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') missionId: string,
    @Param('stopId') stopId: string,
    @Body(new ZodValidationPipe(updateStopSchema)) dto: UpdateStopInput,
  ) {
    return this.missions.updateStop(user.organizationId, missionId, stopId, dto);
  }

  @Roles('dispatcher', 'admin')
  @Delete(':id/stops/:stopId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprime un arret' })
  async removeStop(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') missionId: string,
    @Param('stopId') stopId: string,
  ) {
    await this.missions.removeStop(user.organizationId, missionId, stopId);
  }
}
