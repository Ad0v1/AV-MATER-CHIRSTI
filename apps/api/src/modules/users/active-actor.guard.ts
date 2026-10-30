import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { RequestWithUser } from '../academic/request-user.js';
import { USERS_MSG } from './users.errors.js';

/**
 * Exige que el actor siga ACTIVE en la BD (la sesión solo trae { id, role } y dura hasta 8 h).
 * Mitigación local del hallazgo ALTO del expediente F3: un ADMIN pasado a INACTIVE o WITHDRAWN
 * no puede seguir gestionando usuarios con su sesión abierta. La corrección real (revocar las
 * sesiones del usuario, RF-08) es de Dev 1. Se usa después del RolesGuard global.
 */
@Injectable()
export class ActiveActorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { status: true, role: true },
    });
    if (row?.status !== 'ACTIVE' || row.role !== user.role) {
      throw new ForbiddenException(USERS_MSG.inactiveActor);
    }
    return true;
  }
}
