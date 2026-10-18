import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload, LoginInput, RegisterInput } from '@sira/shared';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cout du hachage bcrypt. 12 tient en ~250 ms sur un petit VPS : assez lent
 * pour rendre une attaque hors ligne couteuse, assez rapide pour que la
 * connexion reste supportable sur un reseau mobile deja lent.
 */
const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
  fullName: string;
  role: AccessTokenPayload['role'];
  organizationId: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * Hachage factice compare lorsqu'aucun utilisateur ne correspond, afin que
   * le temps de reponse ne revele pas l'existence d'un numero. Calcule une
   * fois au demarrage plutot qu'a chaque requete.
   */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await bcrypt.hash('mot-de-passe-inexistant', BCRYPT_ROUNDS);
  }

  async register(input: RegisterInput): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) {
      throw new ConflictException('Ce numero est deja inscrit');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // L'organisation et son premier utilisateur naissent ensemble : un compte
    // sans organisation n'aurait aucun sens dans le modele.
    const user = await this.prisma.user.create({
      data: {
        phone: input.phone,
        passwordHash,
        fullName: input.fullName,
        // Le createur est administrateur de son organisation, qu'il soit
        // livreur independant ou dispatcheur d'une PME.
        role: 'admin',
        organization: { create: { name: input.organizationName } },
      },
    });

    return { user: toAuthenticatedUser(user), ...(await this.issueTokens(user)) };
  }

  async login(input: LoginInput): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { phone: input.phone } });

    // Comparaison systematique, meme sans utilisateur : sans cela, le temps de
    // reponse distingue « numero inconnu » de « mot de passe faux », ce qui
    // permet d'enumerer les comptes.
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? this.dummyHash);

    if (!user || !matches || !user.isActive) {
      throw new UnauthorizedException('Numero ou mot de passe incorrect');
    }

    return { user: toAuthenticatedUser(user), ...(await this.issueTokens(user)) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Jeton de rafraichissement invalide');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Jeton de rafraichissement invalide');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte introuvable ou desactive');
    }

    // Rotation : le jeton presente est revoque et remplace. Si un jeton vole
    // est rejoue apres usage legitime, il est deja revoque.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  /** Revoque tous les jetons de l'utilisateur — deconnexion de tous ses appareils. */
  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: {
    id: string;
    organizationId: string;
    role: AccessTokenPayload['role'];
  }): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });

    // jti : sans lui, deux jetons emis dans la meme seconde pour le meme
    // utilisateur sont identiques au bit pres — memes claims, meme iat. Au
    // mieux l'insertion viole l'index unique ; au pire deux appareils
    // partagent un jeton, et deconnecter l'un deconnecte l'autre.
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.env.JWT_REFRESH_SECRET,
        expiresIn: this.env.JWT_REFRESH_TTL,
      },
    );

    // Seul le hachage est stocke : une fuite de la table ne doit pas suffire
    // a rejouer les sessions.
    const decoded: { exp: number } = this.jwt.decode(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}

/** SHA-256 suffit ici : le jeton est deja une valeur aleatoire longue. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Expose uniquement ce qui peut sortir de l'API — jamais passwordHash. */
function toAuthenticatedUser(user: {
  id: string;
  phone: string;
  fullName: string;
  role: AccessTokenPayload['role'];
  organizationId: string;
}): AuthenticatedUser {
  return {
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    organizationId: user.organizationId,
  };
}
