import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateStopsDataset } from '../src/dataset.js';
import { haversineMeters } from '../src/geo.js';

const datasetPath = fileURLToPath(new URL('../../../data/abidjan-stops.json', import.meta.url));
const raw: unknown = JSON.parse(readFileSync(datasetPath, 'utf8'));

const validation = validateStopsDataset(raw);

describe('data/abidjan-stops.json', () => {
  it('respecte le schema et les coherences metier', () => {
    expect(validation.issues).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('contient les 60 arrets et 2 depots attendus (roadmap Phase 0.5)', () => {
    const dataset = validation.dataset;
    expect(dataset).toBeDefined();
    expect(dataset?.stops).toHaveLength(60);
    expect(dataset?.depots).toHaveLength(2);
  });

  it('couvre les cinq communes du pilote', () => {
    const communes = new Set(validation.dataset?.stops.map((stop) => stop.commune));
    expect(communes).toEqual(
      new Set(['Plateau', 'Cocody', 'Marcory', 'Treichville', 'Yopougon']),
    );
  });

  it('porte un adressage informel exploitable sur chaque arret', () => {
    for (const stop of validation.dataset?.stops ?? []) {
      expect(stop.informalDescription.length, stop.id).toBeGreaterThan(20);
    }
  });

  it('ne contient pas deux arrets au meme point', () => {
    const stops = validation.dataset?.stops ?? [];
    for (let i = 0; i < stops.length; i += 1) {
      for (let j = i + 1; j < stops.length; j += 1) {
        const a = stops[i];
        const b = stops[j];
        if (!a || !b) continue;
        expect(haversineMeters(a, b), `${a.id} / ${b.id}`).toBeGreaterThan(5);
      }
    }
  });

  it('propose un echantillon de contraintes pour le VRP (Phase 2)', () => {
    const stops = validation.dataset?.stops ?? [];
    const withWindow = stops.filter((stop) => stop.timeWindow !== null);
    expect(withWindow.length).toBeGreaterThanOrEqual(10);
    expect(stops.some((stop) => stop.loadKg > 10)).toBe(true);
    expect(stops.some((stop) => stop.priority === 'high')).toBe(true);
  });
});
