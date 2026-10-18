import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'sira:is-public';

/** Ouvre une route au public. Le garde JWT est global : tout est ferme sinon. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
