import type { Mission, MissionDetail, Stop } from '@sira/shared';
import {
  createApiClient,
  type Fetch,
  type SessionStore,
  type StoredSession,
} from '../../src/core/api';
import { mission as missionFixture, stop as stopFixture } from './fixtures';

/**
 * Serveur en memoire qui imite les routes utilisees par la synchronisation,
 * avec ses regles : creation idempotente par id, 404 hors de portee.
 */
export function fakeBackend() {
  const missions = new Map<string, Mission>();
  const stops = new Map<string, Stop>();
  const state = {
    online: true,
    /** Statut force pour la prochaine requete d'ecriture, puis retour a la normale. */
    failNextWrite: null as number | null,
    /** Le serveur enregistre puis la reponse se perd : le cas du doublon. */
    dropNextResponse: false,
    requests: [] as string[],
    patches: [] as { body: Record<string, unknown>; deviceTime: string | undefined }[],
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const detailOf = (id: string): MissionDetail => ({
    ...missions.get(id)!,
    stops: [...stops.values()].filter((s) => s.missionId === id),
  });

  const fetch: Fetch = (url, init) => {
    try {
      return Promise.resolve(handle(url, init));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const handle = (url: string, init: RequestInit): Response => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    state.requests.push(`${method} ${path}`);
    if (!state.online) throw new TypeError('Network request failed');
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};

    if (method === 'POST' && path === '/auth/refresh') {
      return json(200, { accessToken: 'a', refreshToken: 'r' });
    }
    if (method !== 'GET' && state.failNextWrite) {
      const status = state.failNextWrite;
      state.failNextWrite = null;
      return json(status, { message: `Erreur ${status}` });
    }

    let response: Response;
    if (method === 'GET' && path === '/missions') {
      const list = [...missions.values()].map((m) => ({
        ...m,
        _count: { stops: [...stops.values()].filter((s) => s.missionId === m.id).length },
      }));
      response = json(200, { missions: list, nextCursor: null });
    } else if (method === 'POST' && path === '/missions') {
      const id = String(body.id);
      if (!missions.has(id)) {
        missions.set(
          id,
          missionFixture(id, { label: (body.label as string) ?? null, status: 'draft' }),
        );
      }
      response = json(201, detailOf(id));
    } else if (method === 'POST' && /^\/missions\/[^/]+\/stops$/.test(path)) {
      const missionId = path.split('/')[2]!;
      if (!missions.has(missionId)) return json(404, { message: 'Mission introuvable' });
      const id = String(body.id);
      if (!stops.has(id)) {
        stops.set(id, stopFixture(id, missionId, { label: String(body.label) }));
      }
      response = json(201, stops.get(id));
    } else if (method === 'PATCH' && /^\/missions\/[^/]+\/stops\/[^/]+$/.test(path)) {
      const [, , missionId, , stopId] = path.split('/');
      const current = stops.get(stopId!);
      if (!current || current.missionId !== missionId)
        return json(404, { message: 'Introuvable' });
      state.patches.push({
        body,
        deviceTime: (init.headers as Record<string, string>)['X-Device-Time'],
      });
      const updated = { ...current, ...(body as Partial<Stop>) };
      stops.set(stopId!, updated);
      response = json(200, updated);
    } else if (method === 'GET' && path.startsWith('/missions/')) {
      const id = path.split('/')[2]!;
      response = missions.has(id)
        ? json(200, detailOf(id))
        : json(404, { message: 'Introuvable' });
    } else {
      response = json(404, { message: `Route inconnue ${method} ${path}` });
    }

    if (state.dropNextResponse && method !== 'GET') {
      state.dropNextResponse = false;
      throw new TypeError('Network request failed');
    }
    return response;
  };

  return { fetch, missions, stops, state };
}

export function apiOn(backend: ReturnType<typeof fakeBackend>) {
  let session: StoredSession | null = {
    user: {
      id: 'u1',
      phone: '+2250701020304',
      fullName: 'Awa',
      role: 'admin',
      organizationId: 'o1',
    },
    refreshToken: 'r0',
  };
  const store: SessionStore = {
    load: () => Promise.resolve(session),
    save: (s) => {
      session = s;
      return Promise.resolve();
    },
    clear: () => {
      session = null;
      return Promise.resolve();
    },
  };
  return createApiClient({ baseUrl: 'http://api.test', fetch: backend.fetch, store });
}
