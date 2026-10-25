import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateMissionInput,
  CreateStopInput,
  ListMissionsQuery,
  UpdateMissionInput,
  UpdateStopInput,
} from '@sira/shared';
import { validateTimeWindow } from '@sira/shared';
import { AddressBookService } from '../geocoding/address-book.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Toutes les methodes prennent `organizationId` en premier argument, jamais en
 * option. Le cloisonnement entre organisations est la propriete de securite la
 * plus importante de cette API : une mission fuitee, c'est la liste des clients
 * d'un concurrent. Le rendre obligatoire dans la signature evite qu'un oubli
 * passe le typecheck.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly addressBook: AddressBookService,
  ) {}

  async create(organizationId: string, input: CreateMissionInput) {
    await this.assertReferencesBelongToOrg(organizationId, input);

    return this.prisma.mission.create({
      data: {
        organizationId,
        label: input.label ?? null,
        date: new Date(input.date),
        startDepotId: input.startDepotId ?? null,
        endDepotId: input.endDepotId ?? null,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
      },
      include: { stops: { orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  /**
   * `driverScope` : identifiant du livreur connecte, qui ne voit que ses
   * missions (decisions.md, 25/10/2026). Il l'emporte sur le filtre `driverId`
   * de la requete — un livreur ne peut pas demander celles d'un collegue.
   */
  async list(organizationId: string, query: ListMissionsQuery, driverScope?: string) {
    const driverId = driverScope ?? query.driverId;
    const missions = await this.prisma.mission.findMany({
      where: {
        organizationId,
        ...(query.date ? { date: new Date(query.date) } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(driverId ? { driverId } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      // Une page de plus que demandee : sa presence dit s'il reste des
      // resultats, sans compter la table entiere.
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { stops: true } } },
    });

    const hasMore = missions.length > query.limit;
    const page = hasMore ? missions.slice(0, query.limit) : missions;

    return {
      missions: page,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async findOne(organizationId: string, id: string, driverScope?: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id, organizationId, ...(driverScope ? { driverId: driverScope } : {}) },
      include: { stops: { orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] } },
    });
    // 404 et non 403 quand la mission appartient a une autre organisation, ou
    // a un autre livreur : repondre « interdit » confirmerait son existence.
    if (!mission) throw new NotFoundException('Mission introuvable');
    return mission;
  }

  async update(organizationId: string, id: string, input: UpdateMissionInput) {
    await this.findOne(organizationId, id);
    await this.assertReferencesBelongToOrg(organizationId, input);

    return this.prisma.mission.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startDepotId !== undefined ? { startDepotId: input.startDepotId } : {}),
        ...(input.endDepotId !== undefined ? { endDepotId: input.endDepotId } : {}),
        ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
        ...(input.driverId !== undefined ? { driverId: input.driverId } : {}),
      },
      include: { stops: { orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    // Les arrets partent en cascade (onDelete: Cascade dans le schema).
    await this.prisma.mission.delete({ where: { id } });
  }

  // --- Arrets ---------------------------------------------------------------

  async addStop(organizationId: string, missionId: string, input: CreateStopInput) {
    await this.findOne(organizationId, missionId);
    assertTimeWindow(input);

    return this.prisma.stop.create({
      data: {
        missionId,
        label: input.label,
        lat: input.lat,
        lon: input.lon,
        addressText: input.addressText,
        loadKg: input.loadKg,
        volumeL: input.volumeL,
        serviceMinutes: input.serviceMinutes,
        priority: input.priority,
        informalDescription: input.informalDescription ?? null,
        landmark: input.landmark ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        timeWindowStart: input.timeWindowStart ?? null,
        timeWindowEnd: input.timeWindowEnd ?? null,
      },
    });
  }

  async updateStop(
    organizationId: string,
    missionId: string,
    stopId: string,
    input: UpdateStopInput,
    driverScope?: string,
  ) {
    await this.findOne(organizationId, missionId, driverScope);

    const stop = await this.prisma.stop.findFirst({ where: { id: stopId, missionId } });
    if (!stop) throw new NotFoundException('Arret introuvable');

    // La fenetre est validee sur l'etat resultant, pas sur le seul correctif :
    // envoyer uniquement une fin plus tot que le debut existant doit echouer.
    assertTimeWindow({
      timeWindowStart:
        input.timeWindowStart !== undefined ? input.timeWindowStart : stop.timeWindowStart,
      timeWindowEnd:
        input.timeWindowEnd !== undefined ? input.timeWindowEnd : stop.timeWindowEnd,
    });

    const completesNow =
      input.status !== undefined && input.status !== 'pending' && stop.completedAt === null;

    const updated = await this.prisma.stop.update({
      where: { id: stopId },
      data: {
        ...toStopData(input),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
        ...(completesNow ? { completedAt: new Date() } : {}),
      },
    });

    // Le moat se construit ici (cadrage §10.1) : chaque livraison reussie
    // geocode une adresse informelle. Seul `delivered` compte — un echec ou un
    // report ne prouve rien sur l'exactitude du point.
    if (input.status === 'delivered') {
      await this.recordAddressConfirmation(organizationId, updated);
    }

    return updated;
  }

  /**
   * Alimente la base d'adresses sans jamais faire echouer la livraison. Un
   * livreur qui marque un arret livre, souvent sur un reseau instable, ne doit
   * pas voir sa requete echouer parce qu'une ecriture annexe a rate.
   */
  private async recordAddressConfirmation(
    organizationId: string,
    stop: {
      id: string;
      label: string;
      addressText: string;
      informalDescription: string | null;
      lat: number;
      lon: number;
      addressId: string | null;
    },
  ): Promise<void> {
    try {
      const { addressId } = await this.addressBook.confirmDelivery({
        organizationId,
        label: stop.label,
        addressText: stop.addressText,
        informalDescription: stop.informalDescription,
        lat: stop.lat,
        lon: stop.lon,
      });

      if (stop.addressId !== addressId) {
        await this.prisma.stop.update({ where: { id: stop.id }, data: { addressId } });
      }
    } catch (error) {
      this.logger.error(
        `Confirmation d'adresse impossible pour l'arret ${stop.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Insere en une transaction : soit les arrets valides entrent tous, soit
   * aucun. Un import a moitie applique laisserait le dispatcheur incapable de
   * savoir quoi rejouer.
   */
  async addStops(organizationId: string, missionId: string, inputs: CreateStopInput[]) {
    await this.findOne(organizationId, missionId);
    if (inputs.length === 0) return { created: 0 };

    const created = await this.prisma.stop.createMany({
      data: inputs.map((input) => ({
        missionId,
        label: input.label,
        lat: input.lat,
        lon: input.lon,
        addressText: input.addressText,
        loadKg: input.loadKg,
        volumeL: input.volumeL,
        serviceMinutes: input.serviceMinutes,
        priority: input.priority,
        informalDescription: input.informalDescription ?? null,
        landmark: input.landmark ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        timeWindowStart: input.timeWindowStart ?? null,
        timeWindowEnd: input.timeWindowEnd ?? null,
      })),
    });

    return { created: created.count };
  }

  async removeStop(organizationId: string, missionId: string, stopId: string): Promise<void> {
    await this.findOne(organizationId, missionId);
    const { count } = await this.prisma.stop.deleteMany({ where: { id: stopId, missionId } });
    if (count === 0) throw new NotFoundException('Arret introuvable');
  }

  /**
   * Un vehicule, un livreur ou un depot d'une autre organisation ne doit pas
   * pouvoir etre rattache a une mission. Sans ce controle, Prisma accepterait
   * la cle etrangere sans broncher.
   */
  private async assertReferencesBelongToOrg(
    organizationId: string,
    input: MissionReferences,
  ): Promise<void> {
    const checks: Promise<void>[] = [];

    if (input.vehicleId) {
      checks.push(
        this.assertExists(
          this.prisma.vehicle.count({ where: { id: input.vehicleId, organizationId } }),
          'Vehicule introuvable dans cette organisation',
        ),
      );
    }
    if (input.driverId) {
      checks.push(
        this.assertExists(
          this.prisma.user.count({ where: { id: input.driverId, organizationId } }),
          'Livreur introuvable dans cette organisation',
        ),
      );
    }
    for (const depotId of [input.startDepotId, input.endDepotId]) {
      if (depotId) {
        checks.push(
          this.assertExists(
            this.prisma.depot.count({ where: { id: depotId, organizationId } }),
            'Depot introuvable dans cette organisation',
          ),
        );
      }
    }

    await Promise.all(checks);
  }

  private async assertExists(count: Promise<number>, message: string): Promise<void> {
    if ((await count) === 0) throw new BadRequestException(message);
  }
}

/**
 * Champs d'une mission pointant vers une autre entite. Ecrits a la main plutot
 * que derives par Partial<> : avec exactOptionalPropertyTypes, un champ absent
 * et un champ a undefined ne sont pas le meme type, et les entrees de creation
 * comme de mise a jour doivent toutes deux passer ici.
 */
interface MissionReferences {
  vehicleId?: string | null | undefined;
  driverId?: string | null | undefined;
  startDepotId?: string | null | undefined;
  endDepotId?: string | null | undefined;
}

function assertTimeWindow(stop: {
  timeWindowStart?: string | null | undefined;
  timeWindowEnd?: string | null | undefined;
}): void {
  const error = validateTimeWindow(stop);
  if (error) throw new BadRequestException(error);
}

/** Ne recopie que les champs reellement fournis, pour que PATCH reste partiel. */
function toStopData(input: UpdateStopInput) {
  const fields = [
    'label',
    'lat',
    'lon',
    'addressText',
    'informalDescription',
    'landmark',
    'contactName',
    'contactPhone',
    'timeWindowStart',
    'timeWindowEnd',
    'loadKg',
    'volumeL',
    'serviceMinutes',
    'priority',
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  return data;
}
