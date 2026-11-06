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

  // Sortea `count` codigos distintos entre si y libres en la base, para una importacion masiva. Los
  // codigos aun no estan insertados, asi que se evitan repetidos dentro del lote y se consultan los
  // que ya existen; el indice unico de `User.code` sigue siendo la ultima defensa.
  async generateMany(count: number, date: Date = new Date(), db: UserReader = this.prisma) {
    const codes = new Set<string>();
    for (let round = 0; codes.size < count && round < MAX_ATTEMPTS; round++) {
      const candidates: string[] = [];
      while (codes.size + candidates.length < count) {
        const code = generateUserCode(date);
        if (!codes.has(code) && !candidates.includes(code)) candidates.push(code);
      }
      const taken = await db.user.findMany({
        where: { code: { in: candidates } },
        select: { code: true },
      });
      const takenSet = new Set(taken.map((u) => u.code));
      for (const code of candidates) if (!takenSet.has(code)) codes.add(code);
    }
    if (codes.size < count) throw new Error('No se pudieron generar los codigos de usuario');
    return [...codes];
  }

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
