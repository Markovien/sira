import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '@sira/shared';
import type { Request } from 'express';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { IS_PUBLIC } from './public.decorator';

/** Requete portant l'utilisateur authentifie, une fois le garde passe. */
export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

/**
 * Applique en global : une route est protegee par defaut et doit s'ouvrir
 * explicitement avec @Public(). L'inverse — ouvrir par defaut et penser a
 * fermer — laisse tot ou tard une route exposee par oubli.
 *
 * Pas de passport : la verification du jeton est faite par @nestjs/jwt, et ce
 * garde n'ajoute qu'une lecture d'en-tete. Les strategies de passport
 * apporteraient une indirection pour un besoin qui n'existe pas ici.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Jeton d'acces absent");
    }

    try {
      request.user = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      return true;
    } catch {
      throw new UnauthorizedException("Jeton d'acces invalide ou expire");
    }
  }
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : undefined;
}
