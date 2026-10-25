import {
  authResponseSchema,
  authUserSchema,
  geocodeSearchResponseSchema,
  loginSchema,
  missionDetailSchema,
  missionListSchema,
  normalizeIvorianPhone,
  stopSchema,
  tableResponseSchema,
  tokenPairSchema,
  type AuthUser,
  type Coordinates,
  type CreateMissionInput,
  type CreateStopInput,
  type GeocodeSearchResponse,
  type Stop,
  type MissionDetail,
  type MissionList,
  type UpdateStopInput,
} from '@sira/shared';
import { z, type ZodType } from 'zod';
import type { RoutedMatrices } from './optimize';

/**
 * Client de l'API pour l'app livreur. Session et transport sont injectes : en
 * production `expo-secure-store` et `fetch`, en test des doublures. Voir
 * decisions.md (25/10/2026) pour la tenue de session hors connexion.
 */

export const storedSessionSchema = z.object({
  user: authUserSchema,
  refreshToken: z.string().min(1),
});
export type StoredSession = z.infer<typeof storedSessionSchema>;

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** L'API a repondu, par un refus. `message` est destine a l'utilisateur. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Aucune reponse : hors connexion, serveur injoignable ou trop lent. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Serveur injoignable', { cause });
    this.name = 'NetworkError';
  }
}

/** Le jeton de rafraichissement est refuse : il faut se reconnecter. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expiree');
    this.name = 'SessionExpiredError';
  }
}

/** La reponse ne respecte pas le contrat de `@sira/shared`. */
export class ContractError extends Error {
  constructor(path: string, issues: string) {
    super(`Reponse inattendue de ${path} : ${issues}`);
    this.name = 'ContractError';
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: Fetch;
  readonly store: SessionStore;
  /** Appele quand la session est definitivement perdue. */
  readonly onSessionExpired?: () => void;
  readonly timeoutMs?: number;
  /** Horloge du telephone ; injectee pour les tests. */
  readonly now?: () => Date;
}

/**
 * 15 s : sur un reseau 3G sature, une requete legitime prend plusieurs
 * secondes, mais au-dela le livreur a deja conclu que « ca ne marche pas ».
 */
const DEFAULT_TIMEOUT_MS = 15_000;

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH';
  readonly body?: unknown;
  readonly authenticated?: boolean;
  readonly timeoutMs?: number;
}

/** Delai court : au-dela, l'estimation de repli vaut mieux qu'une attente. */
const TABLE_TIMEOUT_MS = 5_000;

export function createApiClient(options: ApiClientOptions) {
  const { store, onSessionExpired } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  let accessToken: string | null = null;
  // Un seul rafraichissement en vol : l'API revoque le jeton presente, deux
  // appels concurrents avec le meme jeton se deconnecteraient l'un l'autre.
  let refreshing: Promise<string> | null = null;

  async function send(path: string, init: RequestOptions, token: string | null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    // Heure du telephone a l'envoi : le serveur en deduit le decalage de son
    // horloge et corrige l'heure declaree d'une livraison (decisions.md,
    // 26/10/2026). Quelques octets par requete.
    headers['X-Device-Time'] = now().toISOString();
    try {
      return await options.fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      throw new NetworkError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async function errorFrom(response: Response): Promise<ApiError> {
    let message = `Erreur ${response.status}`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(', ');
    } catch {
      // Corps absent ou non JSON : le code HTTP suffira.
    }
    return new ApiError(response.status, message);
  }

  async function parse<T>(
    response: Response,
    schema: ZodType<T, z.ZodTypeDef, unknown>,
    path: string,
  ) {
    const result = schema.safeParse(await response.json());
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join(' ; ');
      throw new ContractError(path, issues);
    }
    return result.data;
  }

  async function expire(): Promise<never> {
    accessToken = null;
    await store.clear();
    onSessionExpired?.();
    throw new SessionExpiredError();
  }

  async function doRefresh(): Promise<string> {
    const session = await store.load();
    if (!session) return expire();
    const response = await send(
      '/auth/refresh',
      {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
      },
      null,
    );
    // Seul un refus explicite termine la session. Une panne serveur (5xx) ou
    // l'absence de reseau la laissent intacte : on reessaiera plus tard.
    if (response.status === 401) return expire();
    if (!response.ok) throw await errorFrom(response);
    const tokens = await parse(response, tokenPairSchema, '/auth/refresh');
    await store.save({ user: session.user, refreshToken: tokens.refreshToken });
    accessToken = tokens.accessToken;
    return tokens.accessToken;
  }

  function refresh(): Promise<string> {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(
    path: string,
    schema: ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestOptions = {},
  ): Promise<T> {
    const authenticated = init.authenticated ?? true;
    let token = authenticated ? (accessToken ?? (await refresh())) : null;
    let response = await send(path, init, token);

    // Jeton d'acces expire (15 min) : un rafraichissement, une seule reprise.
    if (authenticated && response.status === 401) {
      token = await refresh();
      response = await send(path, init, token);
    }
    if (!response.ok) throw await errorFrom(response);
    return parse(response, schema, path);
  }

  return {
    /** Session conservee sur l'appareil, sans aucun appel reseau. */
    async restore(): Promise<AuthUser | null> {
      return (await store.load())?.user ?? null;
    },

    async login(phone: string, password: string): Promise<AuthUser> {
      const input = loginSchema.safeParse({ phone: normalizeIvorianPhone(phone), password });
      if (!input.success)
        throw new ApiError(400, input.error.issues[0]?.message ?? 'Saisie invalide');
      const auth = await request('/auth/login', authResponseSchema, {
        method: 'POST',
        body: input.data,
        authenticated: false,
      });
      await store.save({ user: auth.user, refreshToken: auth.refreshToken });
      accessToken = auth.accessToken;
      return auth.user;
    },

    /**
     * Revoque les jetons cote serveur si possible, puis oublie la session
     * quoi qu'il arrive : un livreur qui se deconnecte en zone blanche doit
     * l'etre. Le jeton de rafraichissement reste alors valide sur le serveur
     * jusqu'a son expiration, mais n'existe plus nulle part sur l'appareil.
     */
    async logout(): Promise<void> {
      try {
        if (accessToken) await send('/auth/logout', { method: 'POST' }, accessToken);
      } catch {
        // Hors connexion : la deconnexion locale suffit.
      }
      accessToken = null;
      await store.clear();
    },

    /** Le corps porte un `id` choisi par le client : le rejeu est idempotent. */
    createMission(input: CreateMissionInput & { id: string }): Promise<MissionDetail> {
      return request('/missions', missionDetailSchema, { method: 'POST', body: input });
    },

    addStop(missionId: string, input: CreateStopInput & { id: string }): Promise<Stop> {
      return request(`/missions/${encodeURIComponent(missionId)}/stops`, stopSchema, {
        method: 'POST',
        body: input,
      });
    },

    updateStop(missionId: string, stopId: string, patch: UpdateStopInput): Promise<Stop> {
      return request(
        `/missions/${encodeURIComponent(missionId)}/stops/${encodeURIComponent(stopId)}`,
        stopSchema,
        { method: 'PATCH', body: patch },
      );
    },

    /**
     * Matrices OSRM, ou `null` si elles sont incompletes : un couple de points
     * non relie rendrait le solveur inutilisable (decisions.md, 25/10/2026).
     */
    async routingTable(points: readonly Coordinates[]): Promise<RoutedMatrices | null> {
      const table = await request('/routing/table', tableResponseSchema, {
        method: 'POST',
        body: { points: points.map(({ lat, lon }) => ({ lat, lon })), withDistances: true },
        timeoutMs: TABLE_TIMEOUT_MS,
      });
      const complete = (m: (number | null)[][] | undefined): m is number[][] =>
        m !== undefined &&
        m.length === points.length &&
        m.every((row) => row.every((v) => v !== null));
      if (!complete(table.durations) || !complete(table.distances)) return null;
      return { durations: table.durations, distances: table.distances };
    },

    searchAddresses(query: string): Promise<GeocodeSearchResponse> {
      const params = new URLSearchParams({ q: query, limit: '5' });
      return request(`/geocoding/search?${params.toString()}`, geocodeSearchResponseSchema, {
        timeoutMs: TABLE_TIMEOUT_MS,
      });
    },

    listMissions(): Promise<MissionList> {
      // Le serveur restreint deja un livreur a ses missions : pas de filtre ici.
      return request('/missions', missionListSchema);
    },

    getMission(id: string): Promise<MissionDetail> {
      return request(`/missions/${encodeURIComponent(id)}`, missionDetailSchema);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
