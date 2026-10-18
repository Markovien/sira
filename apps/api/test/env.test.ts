import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://sira:sira@localhost:5432/sira?schema=public',
  JWT_ACCESS_SECRET: 'un-secret-assez-long',
  JWT_REFRESH_SECRET: 'un-autre-secret-long',
};

describe('loadEnv', () => {
  it('applique les valeurs par defaut', () => {
    const env = loadEnv({ ...valid });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.OSRM_URL).toBe('http://localhost:5000');
  });

  it('convertit le port en nombre', () => {
    const env = loadEnv({ ...valid, API_PORT: '8080' });
    expect(env.API_PORT).toBe(8080);
  });

  it('refuse un secret trop court plutot que de demarrer', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'court' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('refuse une DATABASE_URL absente et le dit clairement', () => {
    const { DATABASE_URL: _omis, ...sansUrl } = valid;
    expect(() => loadEnv(sansUrl as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
