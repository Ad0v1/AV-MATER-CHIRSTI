import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ENV, type Env } from '../../config/config.module.js';
import { PrismaClient } from '../../generated/prisma/client.js';

// Cliente unico de base de datos para toda la API. Conecta de forma perezosa:
// no abre conexion hasta la primera consulta.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
