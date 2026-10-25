import { ApiError, ContractError, NetworkError, SessionExpiredError } from './api';

/**
 * Message affichable pour une erreur quelconque. Les textes viennent du
 * dictionnaire : `core` ne connait que les cles.
 */
export type ErrorMessage =
  | { key: 'error.offline' }
  | { key: 'error.sessionExpired' }
  | { key: 'error.contract' }
  | { key: 'error.server'; detail: string }
  | { key: 'error.unknown' };

export function describeError(error: unknown): ErrorMessage {
  if (error instanceof NetworkError) return { key: 'error.offline' };
  if (error instanceof SessionExpiredError) return { key: 'error.sessionExpired' };
  if (error instanceof ContractError) return { key: 'error.contract' };
  if (error instanceof ApiError) return { key: 'error.server', detail: error.message };
  return { key: 'error.unknown' };
}
