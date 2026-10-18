import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { toOsrmCoordinates, type Coordinates } from '@sira/shared';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Client OSRM type (roadmap Phase 1.4).
 *
 * Toutes les coordonnees passent par `toOsrmCoordinates` de @sira/shared :
 * OSRM attend `lon,lat` quand le reste du projet manipule `{ lat, lon }`, et
 * l'inversion est l'erreur classique. Elle ne produit pas d'echec franc mais
 * un itineraire plausible au mauvais endroit — un bug qui se voit en
 * production, pas en test.
 */

/** Aligne sur --max-table-size du conteneur osrm (infra/docker-compose.yml). */
export const MAX_TABLE_SIZE = 100;

/** Au-dela, c'est qu'OSRM ne repond plus : mieux vaut echouer que faire attendre. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface RouteResult {
  /** Duree en secondes, telle que modelisee par le profil OSRM. */
  durationSeconds: number;
  distanceMeters: number;
  /** Trace encodee (polyline5), directement exploitable par MapLibre. */
  geometry: string | null;
}

export interface TableResult {
  /** durations[i][j] en secondes, de l'origine i vers la destination j. */
  durations: number[][];
  /** Presente seulement si demandee — doubler la charge utile a un cout. */
  distances?: number[][];
}

interface OsrmErrorBody {
  code?: string;
  message?: string;
}

@Injectable()
export class OsrmService {
  private readonly logger = new Logger(OsrmService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Itineraire passant par les points donnes, dans l'ordre fourni. */
  async route(
    points: readonly Coordinates[],
    options: { geometry?: boolean } = {},
  ): Promise<RouteResult> {
    if (points.length < 2) {
      throw new BadRequestException('Au moins deux points sont requis pour un itineraire');
    }

    const query = new URLSearchParams({
      overview: options.geometry === false ? 'false' : 'full',
      geometries: 'polyline',
      steps: 'false',
    });

    const body = await this.request<{
      routes?: { duration: number; distance: number; geometry?: string }[];
    }>(`/route/v1/driving/${toOsrmCoordinates(points)}?${query.toString()}`);

    const first = body.routes?.[0];
    if (!first) {
      throw new UnprocessableEntityException('Aucun itineraire entre ces points');
    }

    return {
      durationSeconds: first.duration,
      distanceMeters: first.distance,
      geometry: first.geometry ?? null,
    };
  }

  /**
   * Matrice N x N des durees, socle du TSP et du VRP (Phase 2).
   * `distances` n'est demandee que si utile : OSRM la calcule a part et la
   * charge utile double.
   */
  async table(
    points: readonly Coordinates[],
    options: { withDistances?: boolean } = {},
  ): Promise<TableResult> {
    if (points.length < 2) {
      throw new BadRequestException('Au moins deux points sont requis pour une matrice');
    }
    if (points.length > MAX_TABLE_SIZE) {
      throw new BadRequestException(
        `Matrice limitee a ${MAX_TABLE_SIZE} points (${points.length} demandes)`,
      );
    }

    const query = new URLSearchParams({
      annotations: options.withDistances ? 'duration,distance' : 'duration',
    });

    const body = await this.request<{ durations?: number[][]; distances?: number[][] }>(
      `/table/v1/driving/${toOsrmCoordinates(points)}?${query.toString()}`,
    );

    if (!body.durations) {
      throw new UnprocessableEntityException("OSRM n'a pas renvoye de matrice de durees");
    }

    return {
      durations: body.durations,
      ...(body.distances ? { distances: body.distances } : {}),
    };
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.env.OSRM_URL}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      // Injoignable ou trop lent : c'est l'infrastructure, pas la requete.
      this.logger.error(`OSRM injoignable sur ${this.env.OSRM_URL}`, error);
      throw new ServiceUnavailableException('Service de routage indisponible');
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => ({}))) as T & OsrmErrorBody;

    if (!response.ok || (body.code && body.code !== 'Ok')) {
      throw mapOsrmError(body, response.status);
    }

    return body;
  }
}

/**
 * Traduit les codes d'erreur OSRM. La distinction compte : « pas de route »
 * est une donnee d'entree impossible a satisfaire, que le dispatcheur doit
 * corriger, tandis qu'une erreur de service releve de l'exploitation.
 */
function mapOsrmError(body: OsrmErrorBody, status: number): Error {
  switch (body.code) {
    case 'NoRoute':
      return new UnprocessableEntityException(
        'Aucun itineraire entre ces points — verifier qu ils sont accessibles par la route',
      );
    case 'NoSegment':
      return new UnprocessableEntityException(
        'Un point est trop loin de toute route connue — verifier les coordonnees',
      );
    case 'TooBig':
      return new BadRequestException('Requete trop grande pour le serveur de routage');
    case 'InvalidQuery':
    case 'InvalidValue':
    case 'InvalidOptions':
      return new BadRequestException(
        `Requete de routage invalide : ${body.message ?? body.code}`,
      );
    default:
      return new ServiceUnavailableException(
        `Service de routage en erreur (${body.code ?? `HTTP ${status}`})`,
      );
  }
}
