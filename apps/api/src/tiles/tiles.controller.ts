import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TilesService } from './tiles.service';

@ApiTags('carte')
@ApiBearerAuth()
@Controller('tiles')
export class TilesController {
  constructor(private readonly tiles: TilesService) {}

  @Get('manifest')
  @ApiOperation({
    summary: 'Version de la carte hors-ligne',
    description:
      "Le telephone compare `version` et `md5` a ceux de son archive et ne retelecharge que s'ils changent : quelques centaines d'octets par verification.",
  })
  @ApiResponse({ status: 404, description: 'Aucun extrait prepare sur ce serveur' })
  manifest() {
    return this.tiles.manifest();
  }

  @Get(':file')
  @ApiOperation({
    summary: 'Archive PMTiles de la carte hors-ligne',
    description:
      'Servie telle quelle, avec ETag et requetes de plage : un telechargement interrompu peut reprendre.',
  })
  @ApiResponse({ status: 404, description: 'Fichier absent du manifeste' })
  async archive(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const { path, manifest } = await this.tiles.archivePath(file);
    // Le contenu est fixe pour un md5 donne : le telephone peut le garder
    // indefiniment, c'est le manifeste qui dit quand en changer.
    res.setHeader('ETag', `"${manifest.md5}"`);
    await new Promise<void>((done, fail) => {
      res.sendFile(
        path,
        { headers: { 'Content-Type': 'application/vnd.pmtiles' }, etag: false },
        (error) => (error ? fail(error) : done()),
      );
    });
  }
}
