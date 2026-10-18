import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('sante')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Etat du service et de ses dependances' })
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', database: 'up', uptimeSeconds: 42 },
    },
  })
  async check(): Promise<{ status: string; database: string; uptimeSeconds: number }> {
    const databaseUp = await this.prisma.isReachable();
    return {
      // Degrade plutot qu'en echec : le service repond, c'est une dependance
      // qui manque. La distinction compte pour l'orchestrateur.
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
