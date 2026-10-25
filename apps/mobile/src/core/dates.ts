/**
 * Jour calendaire a Abidjan (GMT toute l'annee : le jour UTC), au format
 * AAAA-MM-JJ attendu par l'API, decale de `offsetDays`.
 */
export function abidjanDay(now: Date, offsetDays = 0): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}
