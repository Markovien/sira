import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@sira/shared';

export const ROLES = 'sira:roles';

/** Restreint une route a certains roles. Sans ce decorateur, tout role passe. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);
