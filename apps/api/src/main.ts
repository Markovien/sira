import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Valide avant meme de construire l'application : inutile d'ouvrir un pool
  // de connexions pour decouvrir ensuite qu'un secret manque.
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  // Pas de ValidationPipe global : la validation passe par ZodValidationPipe,
  // applique par route avec le schema partage correspondant (voir
  // src/common/zod-validation.pipe.ts et decisions.md).

  const config = new DocumentBuilder()
    .setTitle('SIRA — API')
    .setDescription(
      "Optimisation de tournees de livraison urbaine en Cote d'Ivoire. " +
        'Missions, arrets, flotte et base d adresses.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(env.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(
    `API sur http://localhost:${env.API_PORT} — documentation sur /docs`,
  );
}

void bootstrap();
