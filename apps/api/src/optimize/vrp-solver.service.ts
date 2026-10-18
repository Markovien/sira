import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Client du microservice VRP (services/vrp-solver).
 *
 * Le service Python ne connait ni la base ni les identifiants metier : il
 * recoit une matrice et rend des tournees en indices. La correspondance avec
 * les arrets reels se fait ici.
 */

export interface VrpVehicle {
  capacity_kg?: number;
  start_index: number;
  end_index?: number;
}

export interface VrpRequest {
  durations: number[][];
  demands_kg?: number[];
  time_windows?: { start: number; end: number }[];
  service_seconds?: number[];
  vehicles: VrpVehicle[];
  time_limit_seconds?: number;
}

export interface VrpRoute {
  vehicle: number;
  stops: number[];
  duration_seconds: number;
  load_kg: number;
  arrival_seconds: number[];
}

export interface VrpResponse {
  routes: VrpRoute[];
  dropped: number[];
  total_duration_seconds: number;
  solve_time_ms: number;
  status: string;
}

@Injectable()
export class VrpSolverService {
  private readonly logger = new Logger(VrpSolverService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async solve(request: VrpRequest): Promise<VrpResponse> {
    const budgetSeconds = request.time_limit_seconds ?? this.env.VRP_SOLVER_TIME_LIMIT_SECONDS;

    // Le delai d'attente laisse une marge au budget du solveur : couper au
    // moment precis ou il allait rendre sa solution serait absurde.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (budgetSeconds + 10) * 1000);

    let response: Response;
    try {
      response = await fetch(`${this.env.VRP_SOLVER_URL}/solve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, time_limit_seconds: budgetSeconds }),
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error(`Solveur VRP injoignable sur ${this.env.VRP_SOLVER_URL}`, error);
      throw new ServiceUnavailableException("Service d'optimisation de flotte indisponible");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Solveur VRP a repondu ${response.status} : ${detail.slice(0, 500)}`);
      // 422 vient de la validation Pydantic : la requete est en cause, pas le
      // service. Tout le reste releve de l'exploitation.
      throw response.status === 422
        ? new UnprocessableEntityException('Contraintes de flotte invalides')
        : new ServiceUnavailableException("Service d'optimisation de flotte en erreur");
    }

    return (await response.json()) as VrpResponse;
  }
}
