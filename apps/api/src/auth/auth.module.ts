import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  // Les secrets sont passes par appel, pas a l'enregistrement du module :
  // acces et rafraichissement en utilisent deux differents.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Gardes globaux : toute route est fermee par defaut et doit s'ouvrir
    // explicitement avec @Public(). L'ordre compte — authentifier avant
    // d'autoriser.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
