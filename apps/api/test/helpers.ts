import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditSink, type AuditRecord } from './../src/common/audit/audit.service.js';
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';

export class MemoryAuditSink extends AuditSink {
  records: AuditRecord[] = [];

  write(record: AuditRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

export type FakeUser = {
  id: string;
  institutionalEmail: string;
  fullName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
  status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
  localCredential: {
    userId: string;
    passwordHash: string;
    totpSecretEncrypted: string | null;
  } | null;
};

// Base de datos falsa en memoria con solo lo que usa el modulo de autenticacion.
export class FakePrisma {
  users: FakeUser[] = [];
  acceptances = new Set<string>();

  user = {
    findUnique: ({ where }: { where: { id?: string; institutionalEmail?: string } }) =>
      Promise.resolve(
        this.users.find((u) =>
          where.id ? u.id === where.id : u.institutionalEmail === where.institutionalEmail,
        ) ?? null,
      ),
  };

  localCredential = {
    update: ({
      where,
      data,
    }: {
      where: { userId: string };
      data: { totpSecretEncrypted: string };
    }) => {
      const cred = this.users.find((u) => u.id === where.userId)!.localCredential!;
      cred.totpSecretEncrypted = data.totpSecretEncrypted;
      return Promise.resolve(cred);
    },
  };

  policyAcceptance = {
    findUnique: ({
      where,
    }: {
      where: { userId_policyVersion: { userId: string; policyVersion: string } };
    }) =>
      Promise.resolve(
        this.acceptances.has(JSON.stringify(where.userId_policyVersion)) ? { id: 'x' } : null,
      ),
    upsert: ({
      where,
    }: {
      where: { userId_policyVersion: { userId: string; policyVersion: string } };
    }) => {
      this.acceptances.add(JSON.stringify(where.userId_policyVersion));
      return Promise.resolve({ id: 'x' });
    },
  };

  $disconnect() {
    return Promise.resolve();
  }
}

export type TestApp = {
  app: INestApplication<App>;
  prisma: FakePrisma;
  audit: MemoryAuditSink;
};

// Crea la app sin depender de Redis ni MySQL: sesiones, bitacora y base de datos quedan en memoria.
export async function createTestApp(): Promise<TestApp> {
  const prisma = new FakePrisma();
  const audit = new MemoryAuditSink();
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(new MemorySessionStore())
    .overrideProvider(AuditSink)
    .useValue(audit)
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return { app, prisma, audit };
}
