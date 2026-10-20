import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditSink, type AuditRecord } from './../src/common/audit/audit.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';

export class MemoryAuditSink extends AuditSink {
  records: AuditRecord[] = [];

  write(record: AuditRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

// Crea la app sin depender de Redis ni MySQL: sesiones y bitacora quedan en memoria.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(new MemorySessionStore())
    .overrideProvider(AuditSink)
    .useValue(new MemoryAuditSink())
    .compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
