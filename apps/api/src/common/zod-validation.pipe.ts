import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valide un corps, un parametre ou une requete avec un schema Zod.
 *
 * Pourquoi pas le ValidationPipe de NestJS : il repose sur class-validator,
 * donc sur des DTO a decorateurs. Cela ferait deux systemes de validation dans
 * le projet, alors que `@sira/shared` expose deja des schemas Zod partages avec
 * le mobile et le dashboard. Une regle metier — le format d'un numero ivoirien,
 * les bornes d'une coordonnee — doit s'ecrire une fois et valoir partout.
 *
 * Usage :
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createMissionSchema)) dto: CreateMission) {}
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      message: 'Donnees invalides',
      // Chemin + message par champ : le dashboard affiche l'erreur en face du
      // bon champ, et l'import CSV peut pointer la colonne fautive.
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
