import type { MissionDetail } from '@sira/shared';
import {
  ApiError,
  ContractError,
  NetworkError,
  SessionExpiredError,
  type ApiClient,
} from './api';
import type { LocalDb, OutboxEntry } from './local-db';

/**
 * Synchronisation (decisions.md, 25/10/2026) : vider la file d'envoi dans
 * l'ordre, puis relire l'etat serveur. Un seul passage a la fois ; un appel
 * pendant un passage en cours recoit le resultat de celui-ci.
 */

export type SyncOutcome =
  | { status: 'synced'; pushed: number; rejected: number; at: string }
  /** Hors connexion ou serveur indisponible : rien n'est perdu, on reessaiera. */
  | { status: 'offline'; pushed: number; rejected: number }
  | { status: 'sessionExpired' };

const ACTIVE_STATUSES = new Set(['draft', 'planned', 'in_progress']);

export const LAST_SYNC_KEY = 'lastSyncAt';

/**
 * Un refus definitif ne se resoudra pas en reessayant : donnees invalides,
 * droits insuffisants, conflit. 401 est traite par le client (rafraichissement),
 * 408 et 429 sont passagers.
 */
function isPermanent(error: ApiError): boolean {
  return error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
}

async function replay(api: ApiClient, entry: OutboxEntry): Promise<void> {
  const { mutation } = entry;
  switch (mutation.kind) {
    case 'createMission':
      await api.createMission(mutation.payload);
      return;
    case 'addStop':
      await api.addStop(mutation.payload.missionId, mutation.payload.stop);
      return;
  }
}

export function createSyncEngine({
  db,
  api,
  now = () => new Date(),
}: {
  db: LocalDb;
  api: ApiClient;
  now?: () => Date;
}) {
  let running: Promise<SyncOutcome> | null = null;

  async function push(): Promise<{ pushed: number; rejected: number; blocked: boolean }> {
    let pushed = 0;
    let rejected = 0;
    for (let entry = await db.nextOutboxEntry(); entry; entry = await db.nextOutboxEntry()) {
      try {
        await replay(api, entry);
        await db.removeOutboxEntry(entry.seq);
        pushed += 1;
      } catch (error) {
        if (error instanceof ApiError && isPermanent(error)) {
          await db.rejectOutboxEntry(entry.seq, `${error.status} ${error.message}`);
          rejected += 1;
          continue;
        }
        if (error instanceof SessionExpiredError) throw error;
        // Reseau, 5xx, reponse illisible : la file reste intacte, dans l'ordre.
        await db.recordOutboxFailure(
          entry.seq,
          error instanceof Error ? error.message : String(error),
        );
        return { pushed, rejected, blocked: true };
      }
    }
    return { pushed, rejected, blocked: false };
  }

  async function pull(): Promise<void> {
    const { missions } = await api.listMissions();
    const [local, pending] = await Promise.all([
      db.localMissionIds(),
      db.missionsWithPendingChanges(),
    ]);
    const details: MissionDetail[] = [];
    // Sequentiel plutot qu'en parallele : sur un reseau 3G sature, dix requetes
    // simultanees echouent ensemble la ou dix successives aboutissent.
    for (const mission of missions) {
      if (pending.has(mission.id)) continue;
      if (ACTIVE_STATUSES.has(mission.status) || !local.has(mission.id)) {
        details.push(await api.getMission(mission.id));
      }
    }
    await db.applyServerState(missions, details);
  }

  async function run(): Promise<SyncOutcome> {
    let pushed = 0;
    let rejected = 0;
    try {
      const result = await push();
      pushed = result.pushed;
      rejected = result.rejected;
      if (result.blocked) return { status: 'offline', pushed, rejected };
      await pull();
      const at = now().toISOString();
      await db.setMeta(LAST_SYNC_KEY, at);
      return { status: 'synced', pushed, rejected, at };
    } catch (error) {
      if (error instanceof SessionExpiredError) return { status: 'sessionExpired' };
      if (
        error instanceof NetworkError ||
        error instanceof ApiError ||
        error instanceof ContractError
      ) {
        return { status: 'offline', pushed, rejected };
      }
      throw error;
    }
  }

  return {
    sync(): Promise<SyncOutcome> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
