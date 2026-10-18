import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/zod-validation.pipe';

const schema = z.object({
  label: z.string().min(1),
  loadKg: z.coerce.number().nonnegative(),
});

describe('ZodValidationPipe', () => {
  it('renvoie la valeur analysee, coercions comprises', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ label: 'Arret', loadKg: '12' })).toEqual({
      label: 'Arret',
      loadKg: 12,
    });
  });

  it('leve une 400 qui nomme le champ fautif', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ label: '', loadKg: -1 });
      expect.unreachable('la validation aurait du echouer');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        errors: { path: string; message: string }[];
      };
      expect(body.errors.map((e) => e.path).sort()).toEqual(['label', 'loadKg']);
    }
  });
});
