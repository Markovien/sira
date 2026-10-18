import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { HealthModule } from './health/health.module';
import { MissionsModule } from './missions/missions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoutingModule } from './routing/routing.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    MissionsModule,
    GeocodingModule,
    RoutingModule,
    HealthModule,
  ],
})
export class AppModule {}
