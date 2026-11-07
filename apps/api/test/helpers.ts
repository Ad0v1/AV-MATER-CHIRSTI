import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditService, AuditSink, type AuditRecord } from './../src/common/audit/audit.service.js';
import { MailSender, type MailMessage } from './../src/common/mail/mail-sender.js';
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';

export class MemoryAuditSink extends AuditSink {
  records: AuditRecord[] = [];

  write(record: AuditRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

// Correo en memoria: guarda lo que la API habria enviado, para leer el codigo en las pruebas.
export class MemoryMailSender extends MailSender {
  sent: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('smtp caido'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  // Codigo de 6 digitos del ultimo correo enviado.
  lastCode(): string {
    const text = this.sent.at(-1)?.text ?? '';
    return /(\d{6})/.exec(text)?.[1] ?? '';
  }
}

export type FakeUser = {
  id: string;
  email: string;
  code: string | null;
  dniEncrypted: string | null;
  contactEmail: string | null;
  contactEmailIsGuardian: boolean;
  emailVerifiedAt: Date | null;
  phone: string | null;
  address: string | null;
  fullName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
  status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
  localCredential: {
    userId: string;
    passwordHash: string;
    totpSecretEncrypted: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
  } | null;
};

// Base de datos falsa en memoria con solo lo que usa el modulo de autenticacion.
export class FakePrisma {
  users: FakeUser[] = [];
  acceptances = new Set<string>();
  lastAcceptance: { onBehalfOfWards?: boolean } | null = null;

  user = {
    findUnique: ({ where }: { where: { id?: string; code?: string; email?: string } }) =>
      Promise.resolve(
        this.users.find((u) =>
          where.id
            ? u.id === where.id
            : where.code
              ? u.code === where.code
              : u.email === where.email,
        ) ?? null,
      ),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<
        Pick<
          FakeUser,
          'contactEmail' | 'contactEmailIsGuardian' | 'emailVerifiedAt' | 'phone' | 'address'
        >
      >;
    }) => {
      const user = this.users.find((u) => u.id === where.id)!;
      Object.assign(user, data);
      return Promise.resolve(user);
    },
  };

  recoveryCodes: Array<{ userId: string; codeHash: string; usedAt: Date | null }> = [];

  recoveryCode = {
    deleteMany: ({ where }: { where: { userId: string } }) => {
      this.recoveryCodes = this.recoveryCodes.filter((r) => r.userId !== where.userId);
      return Promise.resolve({ count: 0 });
    },
    createMany: ({ data }: { data: Array<{ userId: string; codeHash: string }> }) => {
      this.recoveryCodes.push(...data.map((d) => ({ ...d, usedAt: null })));
      return Promise.resolve({ count: data.length });
    },
    updateMany: ({ where }: { where: { userId: string; codeHash: string; usedAt: null } }) => {
      const hit = this.recoveryCodes.filter(
        (r) => r.userId === where.userId && r.codeHash === where.codeHash && !r.usedAt,
      );
      for (const r of hit) r.usedAt = new Date();
      return Promise.resolve({ count: hit.length });
    },
    count: ({ where }: { where: { userId: string; usedAt: null } }) =>
      Promise.resolve(
        this.recoveryCodes.filter((r) => r.userId === where.userId && !r.usedAt).length,
      ),
  };

  // Sin aislamiento: basta para probar la logica; la transaccion real se prueba contra MySQL.
  $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  localCredential = {
    findUnique: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(this.users.find((u) => u.id === where.userId)?.localCredential ?? null),
    update: ({
      where,
      data,
    }: {
      where: { userId: string };
      data: Partial<NonNullable<FakeUser['localCredential']>>;
    }) => {
      const cred = this.users.find((u) => u.id === where.userId)!.localCredential!;
      Object.assign(cred, data);
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
      create,
    }: {
      where: { userId_policyVersion: { userId: string; policyVersion: string } };
      create: { onBehalfOfWards?: boolean };
    }) => {
      this.acceptances.add(JSON.stringify(where.userId_policyVersion));
      this.lastAcceptance = create;
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
  mail: MemoryMailSender;
};

// Crea la app sin depender de Redis ni MySQL: sesiones, bitacora y base de datos quedan en memoria.
export async function createTestApp(): Promise<TestApp> {
  const prisma = new FakePrisma();
  const audit = new MemoryAuditSink();
  const mail = new MemoryMailSender();
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(new MemorySessionStore())
    .overrideProvider(AuditSink)
    .useValue(audit)
    .overrideProvider(MailSender)
    .useValue(mail)
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return { app, prisma, audit, mail };
}

// Igual que createTestApp pero con MySQL real (Prisma sin reemplazar): la usan los e2e de Dev 2
// (academic-api, academic-clone, users-promotion). Añadido al integrar develop el 29/10/2026.
//
// D-047 (fase A1): con `tx`, AuditService.record inserta en AuditLog dentro de la transaccion y no
// pasa por el sink. Para que los e2e sigan leyendo `sink.records`, se copia al sink el evento
// escrito con tx (solo si la insercion tuvo exito, igual que la fila real).
export async function createDbTestApp(): Promise<INestApplication<App>> {
  const sink = new MemoryAuditSink();
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(new MemorySessionStore())
    .overrideProvider(AuditSink)
    .useValue(sink)
    .overrideProvider(MailSender)
    .useValue(new MemoryMailSender())
    .compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  const audit = app.get(AuditService);
  const record = audit.record.bind(audit);
  audit.record = async (event, tx) => {
    await record(event, tx);
    if (tx) await sink.write({ ...event, occurredAt: new Date() });
  };
  return app;
}
