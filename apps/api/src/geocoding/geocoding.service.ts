import { Injectable } from '@nestjs/common';
import { AddressBookService } from './address-book.service';
import { PhotonService, type GeocodeCandidate } from './photon.service';

/**
 * Orchestre les deux sources de geocodage (roadmap Phase 1.5) : Photon
 * d'abord, repli sur la base d'adresses proprietaire.
 *
 * Le repli n'est pas qu'une securite en cas de panne. Photon ne connait que
 * ce qu'OpenStreetMap contient ; la base proprietaire, elle, sait ou se trouve
 * ce qu'un livreur a reellement livre. Les deux resultats sont donc fusionnes,
 * la base proprietaire en tete quand elle a des confirmations — c'est le seul
 * signal de fiabilite terrain dont nous disposions.
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly photon: PhotonService,
    private readonly addressBook: AddressBookService,
  ) {}

  async search(
    organizationId: string,
    query: string,
    limit = 5,
  ): Promise<{ candidates: GeocodeCandidate[]; photonAvailable: boolean }> {
    const [photonResults, ownResults] = await Promise.all([
      this.photon.search(query, limit),
      this.addressBook.searchByText(organizationId, query, limit),
    ]);

    // Les adresses confirmees par une livraison passent devant : une position
    // verifiee sur le terrain vaut mieux qu'une correspondance OSM plausible.
    const merged = [...ownResults, ...photonResults];

    return {
      candidates: dedupe(merged).slice(0, limit),
      // L'interface doit pouvoir signaler un geocodage degrade plutot que de
      // laisser croire a une absence de resultat.
      photonAvailable: photonResults.length > 0,
    };
  }

  /** Adresses deja connues autour d'un point, pour la saisie sur carte. */
  nearby(organizationId: string, point: { lat: number; lon: number }, radiusMeters = 200) {
    return this.addressBook.searchNearby(organizationId, point, radiusMeters);
  }
}

/**
 * Deux sources peuvent decrire le meme lieu. A moins de 25 m et avec un
 * libelle proche, on ne garde que le premier — donc celui de la base
 * proprietaire, place en tete.
 */
function dedupe(candidates: GeocodeCandidate[]): GeocodeCandidate[] {
  const kept: GeocodeCandidate[] = [];

  for (const candidate of candidates) {
    const duplicate = kept.some(
      (existing) =>
        roughDistanceMeters(existing, candidate) < 25 &&
        normalize(existing.label) === normalize(candidate.label),
    );
    if (!duplicate) kept.push(candidate);
  }

  return kept;
}

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Approximation plane suffisante pour comparer deux points a quelques dizaines
 * de metres : inutile de sortir la trigonometrie spherique a cette echelle, et
 * cette fonction tourne sur chaque candidat.
 */
function roughDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((a.lat * Math.PI) / 180);
  const dLat = (a.lat - b.lat) * metersPerDegreeLat;
  const dLon = (a.lon - b.lon) * metersPerDegreeLon;
  return Math.hypot(dLat, dLon);
}
