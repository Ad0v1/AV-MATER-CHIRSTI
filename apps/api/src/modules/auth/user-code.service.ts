import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { generateUserCode } from './user-code.js';

const MAX_ATTEMPTS = 10;

// Cliente de Prisma o transaccion: lo unico que se necesita es leer usuarios.
type UserReader = Pick<Prisma.TransactionClient, 'user'>;

@Injectable()
export class UserCodeService {
  constructor(private readonly prisma: PrismaService) {}

  // Sortea hasta encontrar un codigo libre. Entre comprobar e insertar otro proceso puede tomar el
  // mismo codigo: el indice unico de `User.code` lo detecta y quien inserta debe reintentar.
  async generateUnique(date: Date = new Date(), db: UserReader = this.prisma): Promise<string> {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateUserCode(date);
      const taken = await db.user.findUnique({ where: { code }, select: { id: true } });
      if (!taken) return code;
    }
    throw new Error('No se pudo generar un codigo de usuario libre');
  }
}
