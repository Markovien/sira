import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { solveTsp } from '@sira/tsp-core';
import type { Coordinates } from '@sira/shared';
import type { Prisma } from '@prisma/client';
import { MissionsService } from '../missions/missions.service';
import { PrismaService } from '../prisma/prisma.service';
import { OsrmService } from '../routing/osrm.service';
import { VrpSolverService, type VrpRoute } from './vrp-solver.service';

/**
 * Orchestration de l'optimisation (roadmap Phase 2.3).
 *
 * Recupere les arrets, demande la matrice a OSRM, route vers tsp-core quand il
 * n'y a qu'un vehicule ou vers le solveur VRP quand il y en a plusieurs, puis
 * persiste l'ordre et les heures d'arrivee estimees.
 *
 * Le choix du solveur n'est pas une preference : avec un seul vehicule, le
 * TSP embarque donne l'optimum en quelques centaines de millisecondes sans
 * sortir du processus. Appeler un microservice Python pour cela serait un
 * aller-retour reseau gratuit.
 */

/** Heure de depart par defaut d'une tournee abidjanaise, en secondes. */
const DEFAULT_START_SECONDS = 7 * 3600;

export interface OptimizeOptions {
  vehicleIds?: string[];
  /** Budget du solveur. Defaut : 800 ms en TSP, la valeur du service en VRP. */
  timeLimitMs?: number;
  departureSeconds?: number;
}

export interface OptimizedMissionSummary {
  missionId: string;
  vehicleId: string | null;
  stopCount: number;
  estimatedDurationSeconds: number;
  estimatedDistanceMeters: number;
}

export interface OptimizeResult {
  solver: 'tsp' | 'vrp';
  missions: OptimizedMissionSummary[];
  /** Arrets qu'aucun vehicule n'a pu servir sous les contraintes donnees. */
  unservedStopIds: string[];
  computeTimeMs: number;
}

@Injectable()
export class OptimizeService {
  private readonly logger = new Logger(OptimizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly missions: MissionsService,
    private readonly osrm: OsrmService,
    private readonly vrp: VrpSolverService,
  ) {}

  async optimize(
    organizationId: string,
    missionId: string,
    options: OptimizeOptions = {},
  ): Promise<OptimizeResult> {
    const startedAt = Date.now();
    const mission = await this.missions.findOne(organizationId, missionId);

    if (mission.stops.length < 2) {
      throw new BadRequestException('Au moins deux arrets sont requis pour optimiser');
    }

    const vehicleIds = await this.resolveVehicles(organizationId, mission.vehicleId, options);
    const depot = mission.startDepotId
      ? await this.prisma.depot.findFirst({
          where: { id: mission.startDepotId, organizationId },
        })
      : null;

    // Le depot occupe l'index 0 quand il existe : c'est la convention des deux
    // solveurs, et elle evite d'avoir a le reperer ailleurs.
    const points: Coordinates[] = depot
      ? [{ lat: depot.lat, lon: depot.lon }, ...mission.stops.map(toCoordinates)]
      : mission.stops.map(toCoordinates);
    const stopOffset = depot ? 1 : 0;

    const { durations } = await this.osrm.table(points);

    const result =
      vehicleIds.length > 1
        ? await this.optimizeFleet(mission, durations, stopOffset, vehicleIds, options)
        : await this.optimizeSingle(
            mission,
            durations,
            stopOffset,
            vehicleIds[0] ?? null,
            options,
          );

    return { ...result, computeTimeMs: Date.now() - startedAt };
  }

  // --- Un seul vehicule : TSP embarque ---------------------------------------

  private async optimizeSingle(
    mission: MissionWithStops,
    durations: number[][],
    stopOffset: number,
    vehicleId: string | null,
    options: OptimizeOptions,
  ): Promise<Omit<OptimizeResult, 'computeTimeMs'>> {
    const solution = solveTsp(durations, {
      startIndex: 0,
      // Le livreur rentre chez lui ; un retour au depot se decide par la
      // presence d'un depot d'arrivee, pas par defaut.
      returnToStart: mission.endDepotId !== null,
      timeLimitMs: options.timeLimitMs ?? 800,
      seed: 42,
    });

    const departure = options.departureSeconds ?? DEFAULT_START_SECONDS;
    const ordered = solution.order
      .filter((index) => index >= stopOffset)
      .map((index) => mission.stops[index - stopOffset]!);

    const arrivals = this.computeArrivals(
      solution.order,
      durations,
      mission,
      stopOffset,
      departure,
    );

    await this.persist(mission.id, vehicleId, ordered, arrivals, {
      durationSeconds: solution.totalDurationSeconds,
      distanceMeters: 0,
    });

    return {
      solver: 'tsp',
      missions: [
        {
          missionId: mission.id,
          vehicleId,
          stopCount: ordered.length,
          estimatedDurationSeconds: Math.round(solution.totalDurationSeconds),
          estimatedDistanceMeters: 0,
        },
      ],
      unservedStopIds: [],
    };
  }

  // --- Plusieurs vehicules : solveur VRP -------------------------------------

  private async optimizeFleet(
    mission: MissionWithStops,
    durations: number[][],
    stopOffset: number,
    vehicleIds: string[],
    options: OptimizeOptions,
  ): Promise<Omit<OptimizeResult, 'computeTimeMs'>> {
    if (stopOffset === 0) {
      // Sans depot commun, « trois vehicules » n'a pas de point de depart
      // defini et le probleme n'est pas pose.
      throw new BadRequestException(
        'Un depot de depart est requis pour optimiser une flotte de plusieurs vehicules',
      );
    }

    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } } });
    const capacityById = new Map(vehicles.map((v) => [v.id, v.capacityKg ?? 0]));
    const departure = options.departureSeconds ?? DEFAULT_START_SECONDS;

    const windows = this.buildTimeWindows(mission, departure);
    const response = await this.vrp.solve({
      durations,
      demands_kg: [0, ...mission.stops.map((stop) => stop.loadKg)],
      service_seconds: [0, ...mission.stops.map((stop) => stop.serviceMinutes * 60)],
      ...(windows ? { time_windows: windows } : {}),
      vehicles: vehicleIds.map((id) => ({
        capacity_kg: capacityById.get(id) ?? 0,
        start_index: 0,
        end_index: 0,
      })),
      ...(options.timeLimitMs
        ? { time_limit_seconds: Math.ceil(options.timeLimitMs / 1000) }
        : {}),
    });

    const summaries = await this.splitIntoMissions(
      mission,
      response.routes,
      vehicleIds,
      stopOffset,
    );

    const unserved = response.dropped
      .filter((index) => index >= stopOffset)
      .map((index) => mission.stops[index - stopOffset]!.id);

    if (unserved.length > 0) {
      this.logger.warn(
        `Mission ${mission.id} : ${unserved.length} arret(s) non servi(s) par la flotte`,
      );
    }

    return { solver: 'vrp', missions: summaries, unservedStopIds: unserved };
  }

  /**
   * Une tournee par vehicule, donc une mission par vehicule : la mission
   * d'origine garde la premiere, les suivantes sont creees a cote.
   *
   * C'est ce que le modele impose — une mission porte un livreur et un
   * vehicule — et ce dont le mobile a besoin : chaque livreur ne voit que sa
   * tournee a la connexion.
   */
  private async splitIntoMissions(
    mission: MissionWithStops,
    routes: VrpRoute[],
    vehicleIds: string[],
    stopOffset: number,
  ): Promise<OptimizedMissionSummary[]> {
    const summaries: OptimizedMissionSummary[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [position, route] of routes.entries()) {
        const vehicleId = vehicleIds[route.vehicle] ?? null;
        const stopIndices = route.stops.filter((index) => index >= stopOffset);
        if (stopIndices.length === 0) continue;

        const targetMissionId =
          position === 0
            ? mission.id
            : (
                await tx.mission.create({
                  data: {
                    organizationId: mission.organizationId,
                    label: `${mission.label ?? 'Tournee'} — vehicule ${position + 1}`,
                    date: mission.date,
                    status: 'planned',
                    startDepotId: mission.startDepotId,
                    endDepotId: mission.endDepotId,
                    vehicleId,
                    optimizedAt: new Date(),
                    estimatedDurationSeconds: Math.round(route.duration_seconds),
                  },
                })
              ).id;

        for (const [sequence, matrixIndex] of stopIndices.entries()) {
          const stop = mission.stops[matrixIndex - stopOffset]!;
          const arrivalIndex = route.stops.indexOf(matrixIndex);
          await tx.stop.update({
            where: { id: stop.id },
            data: {
              missionId: targetMissionId,
              sequence,
              estimatedArrival: secondsToDate(
                mission.date,
                route.arrival_seconds[arrivalIndex],
              ),
            },
          });
        }

        if (position === 0) {
          await tx.mission.update({
            where: { id: mission.id },
            data: {
              status: 'planned',
              vehicleId,
              optimizedAt: new Date(),
              estimatedDurationSeconds: Math.round(route.duration_seconds),
            },
          });
        }

        summaries.push({
          missionId: targetMissionId,
          vehicleId,
          stopCount: stopIndices.length,
          estimatedDurationSeconds: Math.round(route.duration_seconds),
          estimatedDistanceMeters: 0,
        });
      }
    });

    return summaries;
  }

  // --- Communs ---------------------------------------------------------------

  private buildTimeWindows(mission: MissionWithStops, departure: number) {
    const hasWindow = mission.stops.some((stop) => stop.timeWindowStart && stop.timeWindowEnd);
    if (!hasWindow) return undefined;

    const dayEnd = 22 * 3600;
    return [
      { start: departure, end: dayEnd },
      ...mission.stops.map((stop) => ({
        start: stop.timeWindowStart ? hhmmToSeconds(stop.timeWindowStart) : departure,
        end: stop.timeWindowEnd ? hhmmToSeconds(stop.timeWindowEnd) : dayEnd,
      })),
    ];
  }

  private computeArrivals(
    order: readonly number[],
    durations: number[][],
    mission: MissionWithStops,
    stopOffset: number,
    departure: number,
  ): Map<string, Date> {
    const arrivals = new Map<string, Date>();
    let clock = departure;

    for (let position = 1; position < order.length; position += 1) {
      const from = order[position - 1]!;
      const to = order[position]!;
      clock += durations[from]?.[to] ?? 0;

      if (to >= stopOffset) {
        const stop = mission.stops[to - stopOffset]!;
        arrivals.set(stop.id, secondsToDate(mission.date, clock));
        clock += stop.serviceMinutes * 60;
      }
    }

    return arrivals;
  }

  private async persist(
    missionId: string,
    vehicleId: string | null,
    ordered: { id: string }[],
    arrivals: Map<string, Date>,
    totals: { durationSeconds: number; distanceMeters: number },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [sequence, stop] of ordered.entries()) {
        await tx.stop.update({
          where: { id: stop.id },
          data: { sequence, estimatedArrival: arrivals.get(stop.id) ?? null },
        });
      }
      await tx.mission.update({
        where: { id: missionId },
        data: {
          status: 'planned',
          ...(vehicleId ? { vehicleId } : {}),
          optimizedAt: new Date(),
          estimatedDurationSeconds: Math.round(totals.durationSeconds),
          estimatedDistanceMeters: Math.round(totals.distanceMeters),
        },
      });
    });
  }

  private async resolveVehicles(
    organizationId: string,
    missionVehicleId: string | null,
    options: OptimizeOptions,
  ): Promise<string[]> {
    const requested = options.vehicleIds ?? (missionVehicleId ? [missionVehicleId] : []);
    if (requested.length === 0) return [];

    const found = await this.prisma.vehicle.findMany({
      where: { id: { in: requested }, organizationId },
      select: { id: true },
    });

    if (found.length !== requested.length) {
      throw new BadRequestException(
        'Un vehicule au moins est introuvable dans cette organisation',
      );
    }

    // L'ordre demande est conserve : le dispatcheur s'attend a ce que le
    // premier vehicule reste sur la mission d'origine.
    return requested;
  }
}

type MissionWithStops = Prisma.MissionGetPayload<{ include: { stops: true } }>;

const toCoordinates = (stop: { lat: number; lon: number }): Coordinates => ({
  lat: stop.lat,
  lon: stop.lon,
});

function hhmmToSeconds(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60;
}

function secondsToDate(day: Date, seconds: number | undefined): Date {
  const base = new Date(day);
  base.setUTCHours(0, 0, 0, 0);
  return new Date(base.getTime() + (seconds ?? 0) * 1000);
}
