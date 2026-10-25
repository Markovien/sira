import { describe, expect, it } from 'vitest';
import { navigationLinks, openFirst } from '../src/core/navigation';

const stop = { lat: 5.3457, lon: -3.9958 };

describe('navigationLinks', () => {
  it('commence par Google Maps et finit par geo:', () => {
    expect(navigationLinks(stop)).toEqual([
      'google.navigation:q=5.345700,-3.995800',
      'geo:5.345700,-3.995800?q=5.345700,-3.995800',
    ]);
  });

  it('met l app preferee en tete, Google en secours', () => {
    const links = navigationLinks(stop, 'waze');
    expect(links[0]).toBe('waze://?ll=5.345700,-3.995800&navigate=yes');
    expect(links[1]).toMatch(/^google\.navigation:/);
    expect(links.at(-1)).toMatch(/^geo:/);
  });

  it('garde la latitude avant la longitude, contrairement a OSRM', () => {
    expect(navigationLinks(stop, 'osmand')[0]).toBe('osmand.navigation:q=5.345700,-3.995800');
  });

  it('encode le libelle de l arret', () => {
    expect(navigationLinks(stop, 'google', 'Pharmacie Saint Jean & Fils').at(-1)).toBe(
      'geo:5.345700,-3.995800?q=5.345700,-3.995800(Pharmacie%20Saint%20Jean%20%26%20Fils)',
    );
  });

  it('n ecrit jamais de notation exponentielle', () => {
    const links = navigationLinks({ lat: 5.0000001, lon: -0.0000001 });
    expect(links.join(' ')).not.toMatch(/e-/);
  });
});

describe('openFirst', () => {
  it('passe a la suivante quand une app est absente', async () => {
    const tried: string[] = [];
    const opened = await openFirst(['a://', 'b://', 'geo:'], (url) => {
      tried.push(url);
      return url === 'a://' ? Promise.reject(new Error('absente')) : Promise.resolve(true);
    });
    expect(opened).toBe('b://');
    expect(tried).toEqual(['a://', 'b://']);
  });

  it('renvoie null si rien ne s ouvre', async () => {
    expect(await openFirst(['a://'], () => Promise.reject(new Error('non')))).toBeNull();
  });
});
