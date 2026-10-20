import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './roles.js';

export const ROLES_KEY = 'allowed-roles';

// Restringe una ruta o controlador a los roles indicados. El rol se valida en el backend (RNF-02).
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
