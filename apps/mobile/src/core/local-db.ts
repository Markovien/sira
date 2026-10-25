import {
  createMissionSchema,
  createStopSchema,
  missionSchema,
  stopSchema,
  type CreateMissionInput,
  type CreateStopInput,
  type Mission,
  type MissionDetail,
  type Stop,
  type StopStatus,
  STOP_STATUSES,
} from '@sira/shared';
import { z } from 'zod';

/**
 * Base locale du mobile (decisions.md, 25/10/2026). Le SQL vit ici, contre une
 * interface de pilote minimale : `expo-sqlite` en production, `node:sqlite`
 * en test. Le pilote n'a pas a savoir faire de transaction : toutes les
 * operations passent par un verrou, et une transaction n'est qu'un BEGIN /
 * COMMIT tenu sous ce verrou. Sans lui, une synchronisation et une saisie
 * entrelaceraient leurs requetes au gre des `await`.
 */

export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

/** Version du schema local ; chaque migration l'incremente d'une unite. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE missions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE stops (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    address_text TEXT NOT NULL,
    informal_description TEXT,
    body TEXT NOT NULL
  );
  CREATE INDEX stops_by_mission ON stops(mission_id, position);
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE TABLE rejected (
    seq INTEGER PRIMARY KEY,
    mission_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    error TEXT NOT NULL
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // Preuves de livraison, gardees 30 jours sur le telephone (decisions.md,
  // 26/10/2026). `data` : nom du fichier photo, ou trace SVG de la signature.
  `
  CREATE TABLE proofs (
    id TEXT PRIMARY KEY,
    stop_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('photo', 'signature')),
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX proofs_by_stop ON proofs(stop_id);
  CREATE INDEX proofs_by_age ON proofs(created_at);
  `,
];

// --- Mutations de la file d'envoi --------------------------------------------

const newMissionSchema = createMissionSchema.extend({ id: z.string().uuid() });
const newStopSchema = createStopSchema.extend({ id: z.string().uuid() });

export const outboxMutationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createMission'), payload: newMissionSchema }),
  z.object({
    kind: z.literal('addStop'),
    payload: z.object({ missionId: z.string().min(1), stop: newStopSchema }),
  }),
  z.object({
    kind: z.literal('updateStop'),
    payload: z.object({
      missionId: z.string().min(1),
      stopId: z.string().min(1),
      patch: z.object({
        status: z.enum(STOP_STATUSES),
        failureReason: z.string().max(400).nullable(),
        completedAt: z.string().datetime({ offset: true }),
        clockWentBack: z.boolean(),
      }),
    }),
  }),
]);
export type OutboxMutation = z.infer<typeof outboxMutationSchema>;

export interface OutboxEntry {
  readonly seq: number;
  readonly mutation: OutboxMutation;
  readonly createdAt: string;
  readonly attempts: number;
}

export interface LocalMissionSummary extends Mission {
  readonly stopCount: number;
  /** Saisies pas encore recues par le serveur. */
  readonly pendingChanges: number;
}

export interface KnownPlace {
  readonly label: string;
  readonly addressText: string;
  readonly informalDescription: string | null;
  readonly lat: number;
  readonly lon: number;
}

export type ProofKind = 'photo' | 'signature';

export interface Proof {
  readonly id: string;
  readonly stopId: string;
  readonly kind: ProofKind;
  readonly data: string;
  readonly createdAt: string;
}

/** Une saisie de statut sur le terrain : livre, echec ou report. */
export interface StopOutcome {
  readonly status: Exclude<StopStatus, 'pending'>;
  readonly failureReason?: string | null;
}

/** Duree de conservation des preuves sur le telephone (arbitrage du fondateur). */
export const PROOF_RETENTION_DAYS = 30;

/** Heure de la saisie la plus tardive vue par ce telephone. */
const LAST_EVENT_KEY = 'lastEventAt';

export type NewMission = Omit<CreateMissionInput, 'id'> & { id: string };
export type NewStop = Omit<CreateStopInput, 'id'> & { id: string };

export function createLocalDb(driver: SqlDriver) {
  let queue: Promise<unknown> = Promise.resolve();

  /** Execute `work` seul, apres tout ce qui a ete demande avant lui. */
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  }

  function transaction<T>(work: () => Promise<T>): Promise<T> {
    return exclusive(async () => {
      await driver.exec('BEGIN');
      try {
        const value = await work();
        await driver.exec('COMMIT');
        return value;
      } catch (error) {
        await driver.exec('ROLLBACK');
        throw error;
      }
    });
  }

  async function enqueue(missionId: string, mutation: OutboxMutation, now: Date) {
    await driver.run(
      'INSERT INTO outbox (mission_id, kind, payload, created_at) VALUES (?, ?, ?, ?)',
      [missionId, mutation.kind, JSON.stringify(mutation.payload), now.toISOString()],
    );
  }

  async function writeStop(stop: Stop, position: number) {
    await driver.run(
      `INSERT OR REPLACE INTO stops
         (id, mission_id, position, label, address_text, informal_description, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        stop.id,
        stop.missionId,
        position,
        stop.label,
        stop.addressText,
        stop.informalDescription,
        JSON.stringify(stop),
      ],
    );
  }

  async function writeMission(mission: Mission) {
    // `body` ne garde que les champs connus du schema : pas de `stops` imbrique.
    const body = missionSchema.parse(mission);
    // Upsert et non INSERT OR REPLACE : REPLACE supprime la ligne avant de la
    // reinserer, et la cascade emporterait tous les arrets de la mission.
    await driver.run(
      `INSERT INTO missions (id, date, body) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET date = excluded.date, body = excluded.body`,
      [body.id, body.date, JSON.stringify(body)],
    );
  }

  async function wipe() {
    for (const table of ['stops', 'missions', 'outbox', 'rejected', 'meta', 'proofs']) {
      await driver.run(`DELETE FROM ${table}`);
    }
  }

  return {
    async migrate(): Promise<void> {
      await exclusive(async () => {
        await driver.exec('PRAGMA foreign_keys = ON');
        const [row] = await driver.all<{ user_version: number }>('PRAGMA user_version');
        const current = row?.user_version ?? 0;
        for (let version = current; version < MIGRATIONS.length; version += 1) {
          await driver.exec('BEGIN');
          await driver.exec(MIGRATIONS[version]!);
          await driver.exec(`PRAGMA user_version = ${version + 1}`);
          await driver.exec('COMMIT');
        }
      });
    },

    listMissions(): Promise<LocalMissionSummary[]> {
      return exclusive(async () => {
        const rows = await driver.all<{ body: string; stop_count: number; pending: number }>(
          `SELECT m.body,
                  (SELECT COUNT(*) FROM stops s WHERE s.mission_id = m.id) AS stop_count,
                  (SELECT COUNT(*) FROM outbox o WHERE o.mission_id = m.id) AS pending
             FROM missions m
            ORDER BY m.date DESC, m.rowid DESC`,
        );
        return rows.map((row) => ({
          ...missionSchema.parse(JSON.parse(row.body)),
          stopCount: row.stop_count,
          pendingChanges: row.pending,
        }));
      });
    },

    getMission(id: string): Promise<MissionDetail | null> {
      return exclusive(async () => {
        const [row] = await driver.all<{ body: string }>(
          'SELECT body FROM missions WHERE id = ?',
          [id],
        );
        if (!row) return null;
        const stops = await driver.all<{ body: string }>(
          'SELECT body FROM stops WHERE mission_id = ? ORDER BY position',
          [id],
        );
        return {
          ...missionSchema.parse(JSON.parse(row.body)),
          stops: stops.map((stop) => stopSchema.parse(JSON.parse(stop.body))),
        };
      });
    },

    /** Mission saisie sur le telephone : visible tout de suite, envoyee plus tard. */
    async createMission(input: NewMission, now: Date): Promise<void> {
      const payload = newMissionSchema.parse(input);
      const stamp = now.toISOString();
      return transaction(async () => {
        await writeMission({
          id: payload.id,
          label: payload.label ?? null,
          // Meme serialisation que l'API : la date de tournee a minuit UTC.
          date: `${payload.date}T00:00:00.000Z`,
          status: 'draft',
          driverId: payload.driverId ?? null,
          vehicleId: payload.vehicleId ?? null,
          startDepotId: payload.startDepotId ?? null,
          endDepotId: payload.endDepotId ?? null,
          optimizedAt: null,
          estimatedDurationSeconds: null,
          estimatedDistanceMeters: null,
          startedAt: null,
          completedAt: null,
          updatedAt: stamp,
        });
        await enqueue(payload.id, { kind: 'createMission', payload }, now);
      });
    },

    async addStop(missionId: string, input: NewStop, now: Date): Promise<Stop> {
      const payload = newStopSchema.parse(input);
      const stop: Stop = {
        id: payload.id,
        missionId,
        label: payload.label,
        lat: payload.lat,
        lon: payload.lon,
        addressText: payload.addressText,
        informalDescription: payload.informalDescription ?? null,
        landmark: payload.landmark ?? null,
        contactName: payload.contactName ?? null,
        contactPhone: payload.contactPhone ?? null,
        timeWindowStart: payload.timeWindowStart ?? null,
        timeWindowEnd: payload.timeWindowEnd ?? null,
        loadKg: payload.loadKg,
        volumeL: payload.volumeL,
        serviceMinutes: payload.serviceMinutes,
        priority: payload.priority,
        sequence: null,
        estimatedArrival: null,
        status: 'pending',
        completedAt: null,
        failureReason: null,
        updatedAt: now.toISOString(),
      };
      return transaction(async () => {
        const [mission] = await driver.all<{ id: string }>(
          'SELECT id FROM missions WHERE id = ?',
          [missionId],
        );
        if (!mission) throw new Error(`Mission ${missionId} absente de la base locale`);
        const [last] = await driver.all<{ next: number }>(
          'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM stops WHERE mission_id = ?',
          [missionId],
        );
        await writeStop(stop, last?.next ?? 0);
        await enqueue(
          missionId,
          { kind: 'addStop', payload: { missionId, stop: payload } },
          now,
        );
        return stop;
      });
    },

    /**
     * Livre, echec ou report, saisi sur le terrain. L'heure est celle du
     * telephone ; si elle precede la saisie la plus tardive deja vue, l'horloge
     * a recule entre-temps et le serveur en sera prevenu (decisions.md,
     * 26/10/2026).
     */
    async recordOutcome(
      missionId: string,
      stopId: string,
      outcome: StopOutcome,
      now: Date,
    ): Promise<{ clockWentBack: boolean }> {
      const stamp = now.toISOString();
      return transaction(async () => {
        const [row] = await driver.all<{ body: string; position: number }>(
          'SELECT body, position FROM stops WHERE id = ? AND mission_id = ?',
          [stopId, missionId],
        );
        if (!row) throw new Error(`Arret ${stopId} absent de la base locale`);
        const [last] = await driver.all<{ value: string }>(
          'SELECT value FROM meta WHERE key = ?',
          [LAST_EVENT_KEY],
        );
        const clockWentBack = last !== undefined && stamp < last.value;
        const failureReason =
          outcome.status === 'delivered' ? null : (outcome.failureReason ?? null);

        const stop = stopSchema.parse(JSON.parse(row.body));
        await writeStop(
          {
            ...stop,
            status: outcome.status,
            failureReason,
            completedAt: stamp,
            updatedAt: stamp,
          },
          row.position,
        );
        await enqueue(
          missionId,
          {
            kind: 'updateStop',
            payload: {
              missionId,
              stopId,
              patch: {
                status: outcome.status,
                failureReason,
                completedAt: stamp,
                clockWentBack,
              },
            },
          },
          now,
        );
        // On retient le maximum : tant que l'horloge n'a pas rattrape la saisie
        // la plus tardive, chaque nouvelle saisie reste signalee.
        if (!clockWentBack) {
          await driver.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
            LAST_EVENT_KEY,
            stamp,
          ]);
        }
        return { clockWentBack };
      });
    },

    // --- Preuves de livraison -------------------------------------------------

    addProof(proof: Proof): Promise<void> {
      return exclusive(() =>
        driver.run(
          'INSERT INTO proofs (id, stop_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)',
          [proof.id, proof.stopId, proof.kind, proof.data, proof.createdAt],
        ),
      );
    },

    proofsFor(stopId: string): Promise<Proof[]> {
      return exclusive(async () => {
        const rows = await driver.all<{
          id: string;
          stop_id: string;
          kind: ProofKind;
          data: string;
          created_at: string;
        }>('SELECT * FROM proofs WHERE stop_id = ? ORDER BY created_at', [stopId]);
        return rows.map((r) => ({
          id: r.id,
          stopId: r.stop_id,
          kind: r.kind,
          data: r.data,
          createdAt: r.created_at,
        }));
      });
    },

    /**
     * Efface les preuves de plus de `PROOF_RETENTION_DAYS` jours et renvoie les
     * fichiers photo encore references, pour que l'appelant supprime les autres.
     */
    expireProofs(now: Date): Promise<Set<string>> {
      const limit = new Date(now.getTime() - PROOF_RETENTION_DAYS * 86_400_000).toISOString();
      return transaction(async () => {
        await driver.run('DELETE FROM proofs WHERE created_at < ?', [limit]);
        const rows = await driver.all<{ data: string }>(
          "SELECT data FROM proofs WHERE kind = 'photo'",
        );
        return new Set(rows.map((r) => r.data));
      });
    },

    /**
     * Lieux deja servis, pour la saisie hors connexion. Un meme lieu revient
     * d'une tournee a l'autre : on ne garde que sa saisie la plus recente.
     */
    searchKnownPlaces(query: string, limit = 8): Promise<KnownPlace[]> {
      const pattern = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return exclusive(async () => {
        const rows = await driver.all<{ body: string }>(
          `SELECT body FROM stops
            WHERE rowid IN (
              SELECT MAX(rowid) FROM stops
               WHERE label LIKE ?1 ESCAPE '\\'
                  OR address_text LIKE ?1 ESCAPE '\\'
                  OR informal_description LIKE ?1 ESCAPE '\\'
               GROUP BY lower(label), lower(address_text)
            )
            ORDER BY label
            LIMIT ?2`,
          [pattern, limit],
        );
        return rows.map((row) => {
          const stop = stopSchema.parse(JSON.parse(row.body));
          return {
            label: stop.label,
            addressText: stop.addressText,
            informalDescription: stop.informalDescription,
            lat: stop.lat,
            lon: stop.lon,
          };
        });
      });
    },

    // --- File d'envoi ---------------------------------------------------------

    nextOutboxEntry(): Promise<OutboxEntry | null> {
      return exclusive(async () => {
        const [row] = await driver.all<{
          seq: number;
          kind: string;
          payload: string;
          created_at: string;
          attempts: number;
        }>('SELECT seq, kind, payload, created_at, attempts FROM outbox ORDER BY seq LIMIT 1');
        if (!row) return null;
        return {
          seq: row.seq,
          mutation: outboxMutationSchema.parse({
            kind: row.kind,
            payload: JSON.parse(row.payload) as unknown,
          }),
          createdAt: row.created_at,
          attempts: row.attempts,
        };
      });
    },

    removeOutboxEntry(seq: number): Promise<void> {
      return exclusive(() => driver.run('DELETE FROM outbox WHERE seq = ?', [seq]));
    },

    recordOutboxFailure(seq: number, error: string): Promise<void> {
      return exclusive(() =>
        driver.run('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?', [
          error,
          seq,
        ]),
      );
    },

    /** Refus definitif : l'entree quitte la file sans bloquer les suivantes. */
    rejectOutboxEntry(seq: number, error: string): Promise<void> {
      return transaction(async () => {
        await driver.run(
          `INSERT INTO rejected (seq, mission_id, kind, payload, created_at, error)
           SELECT seq, mission_id, kind, payload, created_at, ? FROM outbox WHERE seq = ?`,
          [error, seq],
        );
        await driver.run('DELETE FROM outbox WHERE seq = ?', [seq]);
      });
    },

    syncCounts(): Promise<{ pending: number; rejected: number }> {
      return exclusive(async () => {
        const [row] = await driver.all<{ pending: number; rejected: number }>(
          `SELECT (SELECT COUNT(*) FROM outbox) AS pending,
                  (SELECT COUNT(*) FROM rejected) AS rejected`,
        );
        return { pending: row?.pending ?? 0, rejected: row?.rejected ?? 0 };
      });
    },

    // --- Etat serveur ---------------------------------------------------------

    /** Missions presentes en local, avec leur derniere mise a jour connue. */
    localMissionIds(): Promise<Set<string>> {
      return exclusive(async () => {
        const rows = await driver.all<{ id: string }>('SELECT id FROM missions');
        return new Set(rows.map((row) => row.id));
      });
    },

    missionsWithPendingChanges(): Promise<Set<string>> {
      return exclusive(async () => {
        const rows = await driver.all<{ mission_id: string }>(
          'SELECT DISTINCT mission_id FROM outbox',
        );
        return new Set(rows.map((row) => row.mission_id));
      });
    },

    /**
     * Applique l'etat lu sur le serveur. `listed` est la liste complete renvoyee
     * (premiere page) ; `details` les missions relues en detail. Une mission
     * locale absente de `listed` est purgee, sauf si elle a des saisies en
     * attente — elle n'existe peut-etre pas encore cote serveur.
     */
    applyServerState(
      listed: readonly Mission[],
      details: readonly MissionDetail[],
    ): Promise<void> {
      return transaction(async () => {
        const pending = new Set(
          (
            await driver.all<{ mission_id: string }>('SELECT DISTINCT mission_id FROM outbox')
          ).map((row) => row.mission_id),
        );
        const keep = new Set([...listed.map((m) => m.id), ...pending]);
        const local = await driver.all<{ id: string }>('SELECT id FROM missions');
        for (const { id } of local) {
          if (!keep.has(id)) await driver.run('DELETE FROM missions WHERE id = ?', [id]);
        }

        const detailed = new Set(details.map((d) => d.id));
        for (const mission of listed) {
          // Le resume suffit a tenir a jour statut et libelle d'une mission
          // que l'on ne relit pas en detail.
          if (!pending.has(mission.id) && !detailed.has(mission.id)) {
            const [row] = await driver.all<{ id: string }>(
              'SELECT id FROM missions WHERE id = ?',
              [mission.id],
            );
            if (row) await writeMission(mission);
          }
        }
        for (const detail of details) {
          if (pending.has(detail.id)) continue;
          const { stops, ...mission } = detail;
          await writeMission(mission);
          await driver.run('DELETE FROM stops WHERE mission_id = ?', [detail.id]);
          for (const [position, stop] of stops.entries()) await writeStop(stop, position);
        }
      });
    },

    // --- Appartenance (decisions.md, 25/10/2026) -----------------------------

    /**
     * Rattache la base a l'utilisateur connecte. Si elle appartenait a un autre,
     * elle est videe d'abord : un livreur ne doit jamais voir les clients du
     * precedent. Renvoie true si un effacement a eu lieu.
     */
    claimFor(userId: string): Promise<boolean> {
      return transaction(async () => {
        const [row] = await driver.all<{ value: string }>(
          "SELECT value FROM meta WHERE key = 'owner'",
        );
        if (row?.value === userId) return false;
        const wiped = row !== undefined;
        await wipe();
        await driver.run("INSERT INTO meta (key, value) VALUES ('owner', ?)", [userId]);
        return wiped;
      });
    },

    /** Deconnexion volontaire : plus rien ne reste sur le telephone. */
    reset(): Promise<void> {
      return transaction(wipe);
    },

    getMeta(key: string): Promise<string | null> {
      return exclusive(async () => {
        const [row] = await driver.all<{ value: string }>(
          'SELECT value FROM meta WHERE key = ?',
          [key],
        );
        return row?.value ?? null;
      });
    },

    setMeta(key: string, value: string): Promise<void> {
      return exclusive(() =>
        driver.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]),
      );
    },
  };
}

export type LocalDb = ReturnType<typeof createLocalDb>;
