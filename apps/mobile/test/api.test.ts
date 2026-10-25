import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ContractError,
  createApiClient,
  NetworkError,
  SessionExpiredError,
  type Fetch,
  type SessionStore,
  type StoredSession,
} from '../src/core/api';

const user = {
  id: 'u1',
  phone: '+2250701020304',
  fullName: 'Awa Kone',
  role: 'driver' as const,
  organizationId: 'o1',
};

function memoryStore(
  initial: StoredSession | null = null,
): SessionStore & { value: StoredSession | null } {
  return {
    value: initial,
    load() {
      return Promise.resolve(this.value);
    },
    save(session) {
      this.value = session;
      return Promise.resolve();
    },
    clear() {
      this.value = null;
      return Promise.resolve();
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const emptyList = { missions: [], nextCursor: null };

interface Call {
  url: string;
  method: string;
  auth: string | undefined;
  body: unknown;
}

/** Faux serveur : chaque route repond par une fonction de l'appel recu. */
function fakeServer(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch: Fetch = (url, init) => {
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      auth: headers.Authorization,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const route = routes[`${call.method} ${new URL(url).pathname}`];
    if (!route) return Promise.reject(new TypeError('Network request failed'));
    return Promise.resolve(route(call));
  };
  return { fetch, calls };
}

const BASE = 'http://api.test';

describe('connexion', () => {
  it('normalise le numero, garde le jeton de rafraichissement et pas celui d acces', async () => {
    const store = memoryStore();
    const server = fakeServer({
      'POST /auth/login': () => json(200, { user, accessToken: 'a1', refreshToken: 'r1' }),
      'GET /missions': () => json(200, emptyList),
    });
    const api = createApiClient({ baseUrl: `${BASE}/`, fetch: server.fetch, store });

    expect(await api.login('07 01 02 03 04', 'motdepasse')).toEqual(user);
    expect(server.calls[0]?.body).toEqual({ phone: '+2250701020304', password: 'motdepasse' });
    expect(store.value).toEqual({ user, refreshToken: 'r1' });
    expect(JSON.stringify(store.value)).not.toContain('a1');

    await api.listMissions();
    expect(server.calls[1]?.auth).toBe('Bearer a1');
  });

  it('refuse une saisie invalide sans appeler le serveur', async () => {
    const server = fakeServer({});
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, store: memoryStore() });
    await expect(api.login('0102', 'x')).rejects.toThrow(/\+225/);
    expect(server.calls).toHaveLength(0);
  });

  it('remonte le message du serveur', async () => {
    const server = fakeServer({
      'POST /auth/login': () =>
        json(401, { statusCode: 401, message: 'Numero ou mot de passe incorrect' }),
    });
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, store: memoryStore() });
    const error = await api.login('0701020304', 'mauvais').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Numero ou mot de passe incorrect');
  });
});

describe('session', () => {
  it('se restaure en mode avion', async () => {
    const server = fakeServer({});
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      store: memoryStore({ user, refreshToken: 'r1' }),
    });
    expect(await api.restore()).toEqual(user);
    expect(server.calls).toHaveLength(0);
  });

  it('obtient un jeton d acces au premier appel, puis le reutilise', async () => {
    const store = memoryStore({ user, refreshToken: 'r1' });
    const server = fakeServer({
      'POST /auth/refresh': ({ body }) => {
        expect(body).toEqual({ refreshToken: 'r1' });
        return json(200, { accessToken: 'a2', refreshToken: 'r2' });
      },
      'GET /missions': () => json(200, emptyList),
    });
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, store });
    await api.listMissions();
    await api.listMissions();
    expect(server.calls.map((c) => c.url)).toEqual([
      `${BASE}/auth/refresh`,
      `${BASE}/missions`,
      `${BASE}/missions`,
    ]);
    expect(store.value?.refreshToken).toBe('r2');
  });

  it('ne rafraichit qu une fois pour des appels simultanes', async () => {
    let refreshes = 0;
    const server = fakeServer({
      'POST /auth/refresh': () => {
        refreshes += 1;
        return json(200, { accessToken: 'a2', refreshToken: `r${refreshes + 1}` });
      },
      'GET /missions': () => json(200, emptyList),
    });
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      store: memoryStore({ user, refreshToken: 'r1' }),
    });
    await Promise.all([api.listMissions(), api.listMissions(), api.listMissions()]);
    expect(refreshes).toBe(1);
  });

  it('rafraichit et rejoue une fois sur un 401', async () => {
    const server = fakeServer({
      'POST /auth/login': () => json(200, { user, accessToken: 'vieux', refreshToken: 'r1' }),
      'POST /auth/refresh': () => json(200, { accessToken: 'neuf', refreshToken: 'r2' }),
      'GET /missions': ({ auth }) =>
        auth === 'Bearer neuf' ? json(200, emptyList) : json(401, { message: 'expire' }),
    });
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, store: memoryStore() });
    await api.login('0701020304', 'motdepasse');
    await expect(api.listMissions()).resolves.toEqual(emptyList);
  });

  it('termine la session quand le rafraichissement est refuse', async () => {
    const store = memoryStore({ user, refreshToken: 'revoque' });
    const onSessionExpired = vi.fn();
    const server = fakeServer({
      'POST /auth/refresh': () => json(401, { message: 'Jeton de rafraichissement invalide' }),
    });
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      store,
      onSessionExpired,
    });
    await expect(api.listMissions()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(store.value).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('garde la session hors connexion ou sur une panne serveur', async () => {
    const store = memoryStore({ user, refreshToken: 'r1' });
    const offline = createApiClient({ baseUrl: BASE, fetch: fakeServer({}).fetch, store });
    await expect(offline.listMissions()).rejects.toBeInstanceOf(NetworkError);

    const down = fakeServer({
      'POST /auth/refresh': () => json(503, { message: 'Indisponible' }),
    });
    const failing = createApiClient({ baseUrl: BASE, fetch: down.fetch, store });
    await expect(failing.listMissions()).rejects.toBeInstanceOf(ApiError);
    expect(store.value).toEqual({ user, refreshToken: 'r1' });
  });

  it('se deconnecte localement meme sans reseau', async () => {
    const store = memoryStore({ user, refreshToken: 'r1' });
    const api = createApiClient({ baseUrl: BASE, fetch: fakeServer({}).fetch, store });
    await api.logout();
    expect(store.value).toBeNull();
  });
});

describe('contrat', () => {
  it('refuse une reponse qui ne respecte pas les schemas partages', async () => {
    const server = fakeServer({
      'POST /auth/refresh': () => json(200, { accessToken: 'a', refreshToken: 'r' }),
      'GET /missions/m1': () => json(200, { id: 'm1', status: 'archived' }),
    });
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      store: memoryStore({ user, refreshToken: 'r1' }),
    });
    await expect(api.getMission('m1')).rejects.toBeInstanceOf(ContractError);
  });

  it('abandonne une requete trop lente', async () => {
    const hanging: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const api = createApiClient({
      baseUrl: BASE,
      fetch: hanging,
      store: memoryStore(),
      timeoutMs: 20,
    });
    await expect(api.login('0701020304', 'motdepasse')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('routingTable', () => {
  const points = [
    { lat: 5.32, lon: -4.02 },
    { lat: 5.34, lon: -3.99 },
  ];
  const tableApi = (body: unknown) =>
    createApiClient({
      baseUrl: BASE,
      fetch: fakeServer({
        'POST /auth/refresh': () => json(200, { accessToken: 'a', refreshToken: 'r' }),
        'POST /routing/table': () => json(200, body),
      }).fetch,
      store: memoryStore({ user, refreshToken: 'r1' }),
    });

  it('renvoie des matrices completes', async () => {
    const table = {
      durations: [
        [0, 300],
        [310, 0],
      ],
      distances: [
        [0, 2500],
        [2600, 0],
      ],
    };
    await expect(tableApi(table).routingTable(points)).resolves.toEqual(table);
  });

  it('renvoie null si OSRM ne relie pas deux points', async () => {
    const table = {
      durations: [
        [0, null],
        [310, 0],
      ],
      distances: [
        [0, null],
        [2600, 0],
      ],
    };
    await expect(tableApi(table).routingTable(points)).resolves.toBeNull();
  });

  it('renvoie null sans distances', async () => {
    await expect(
      tableApi({
        durations: [
          [0, 1],
          [1, 0],
        ],
      }).routingTable(points),
    ).resolves.toBeNull();
  });
});
