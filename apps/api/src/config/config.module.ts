import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env';

/** Jeton d'injection de la configuration validee. */
export const ENV = Symbol('SIRA_ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
