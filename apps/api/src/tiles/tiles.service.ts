import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { tileManifestSchema, type TileManifest } from '@sira/shared';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Carte hors-ligne (decisions.md, 24/11/2026) : sert l'extrait produit par
 * `infra/tiles/extract.sh`. Ni base ni cache : un manifeste de quelques
 * centaines d'octets, relu a chaque appel, suit un nouvel extrait sans
 * redemarrage. La meme carte vaut pour toutes les organisations ; il n'y a
 * donc rien a cloisonner ici, comme pour le routage.
 */
@Injectable()
export class TilesService {
  private readonly directory: string;

  constructor(@Inject(ENV) env: Env) {
    this.directory = isAbsolute(env.TILES_DIR) ? env.TILES_DIR : resolve(env.TILES_DIR);
  }

  async manifest(): Promise<TileManifest> {
    let raw: string;
    try {
      raw = await readFile(join(this.directory, 'manifest.json'), 'utf8');
    } catch {
      throw new NotFoundException('Carte hors-ligne non preparee sur ce serveur');
    }
    // Le manifeste est verifie a la lecture : un fichier tronque ou edite a la
    // main ne doit pas envoyer les telephones telecharger n'importe quoi.
    return tileManifestSchema.parse(JSON.parse(raw));
  }

  /**
   * Chemin de l'archive demandee. Seul le fichier nomme par le manifeste est
   * servi : rien d'autre du repertoire n'est accessible par cette route.
   */
  async archivePath(file: string): Promise<{ path: string; manifest: TileManifest }> {
    const manifest = await this.manifest();
    if (file !== manifest.file) throw new NotFoundException('Archive de carte inconnue');
    return { path: join(this.directory, manifest.file), manifest };
  }
}
