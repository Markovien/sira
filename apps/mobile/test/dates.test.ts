import { describe, expect, it } from 'vitest';
import { abidjanDay } from '../src/core/dates';

describe('abidjanDay', () => {
  it('donne le jour d Abidjan, y compris tard le soir', () => {
    expect(abidjanDay(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
    expect(abidjanDay(new Date('2026-12-31T23:30:00Z'), 1)).toBe('2027-01-01');
  });
});
