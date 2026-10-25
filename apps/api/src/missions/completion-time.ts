/**
 * Heure retenue pour une livraison (decisions.md, 26/10/2026).
 *
 * Le telephone declare l'heure de la livraison, et donne son heure courante a
 * l'envoi : le decalage entre cette heure et celle du serveur corrige la
 * declaration. Le resultat est ensuite borne au vraisemblable. Fonction pure :
 * toute la regle anti-triche est testable sans base ni horloge.
 */

/** Au-dela, un telephone a l'heure du reseau n'a aucune raison de deriver. */
export const MAX_CLOCK_OFFSET_MS = 5 * 60_000;

/** Tolerance sur le futur : latence reseau et arrondis de l'horloge. */
const FUTURE_TOLERANCE_MS = 60_000;

export interface CompletionInput {
  /** Heure declaree par le telephone ; absente pour un client en ligne (dashboard). */
  reportedAt?: Date | undefined;
  /** Heure du telephone au moment de l'envoi (en-tete X-Device-Time). */
  deviceNow?: Date | undefined;
  serverNow: Date;
  /** Plus tot vraisemblable : debut du jour de tournee, creation de l'arret. */
  notBefore: Date;
  clockWentBack?: boolean | undefined;
}

export interface CompletionTime {
  completedAt: Date;
  timeSuspect: boolean;
}

export function resolveCompletionTime(input: CompletionInput): CompletionTime {
  const { reportedAt, deviceNow, serverNow, notBefore } = input;
  if (!reportedAt) return { completedAt: serverNow, timeSuspect: false };

  const offset = deviceNow ? deviceNow.getTime() - serverNow.getTime() : 0;
  let completedAt = reportedAt.getTime() - offset;
  let timeSuspect = input.clockWentBack === true || Math.abs(offset) > MAX_CLOCK_OFFSET_MS;

  if (completedAt > serverNow.getTime() + FUTURE_TOLERANCE_MS) {
    completedAt = serverNow.getTime();
    timeSuspect = true;
  } else if (completedAt > serverNow.getTime()) {
    completedAt = serverNow.getTime();
  }
  if (completedAt < notBefore.getTime()) {
    completedAt = notBefore.getTime();
    timeSuspect = true;
  }
  return { completedAt: new Date(completedAt), timeSuspect };
}

/** En-tete invalide ou absent : pas de correction, plutot qu'une correction fausse. */
export function parseDeviceTime(header: string | undefined): Date | undefined {
  if (!header) return undefined;
  const parsed = new Date(header);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
