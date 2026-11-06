import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  ContentsEventPublisher,
  type ContentsEvent,
} from './../src/modules/contents/contents-events.js';
import { SubmissionsReadService } from './../src/modules/submissions/submissions-read.service.js';
import {
  ensureSubmissionVersionTrigger,
  withoutSubmissionVersionTrigger,
} from './db-test-guard.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 3d de Dev 3 (RF-33, RF-36..39; RN-06, RN-09, RN-10, RN-12, RN-14; D-006).
// MySQL real con el seed (solo local). Las tareas y los StoredFile CLEAN se insertan directo
// (la subida real es de la fase 3b). La limpieza de versiones usa la guarda de db-test-guard.ts.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
// Confirmación explícita del DDL de limpieza (INFORME 12): este e2e quita y repone el trigger de
// SubmissionVersion. La guarda sigue exigiendo BD local y esperada, sin CI ni production; quien
// ejecute fuera de ese entorno recibe el error de la guarda antes de cualquier DDL.
process.env.E2E_ALLOW_DDL ??= '1';

const API = '/api/v1';
const TITLE_PREFIX = 'QA-3D ';
const KEY_PREFIX = 'qa-3d/';
const HOUR = 3_600_000;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Entregas de Dev 3, fase 3d (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ddl: PrismaClient; // protocolo de texto para el DDL de triggers
  let sink: MemoryAuditSink;
  let events: ContentsEvent[];
  let unsubscribe: () => void = () => undefined;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();

  let cs3AMath: string;
  let period3Of2026: string;
  let period4Of2026: string;
  let enrollment01In3A: string;

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const post = (key: string, url: string, body?: object) =>
    http()
      .post(API + url)
      .set('Cookie', as(key))
      .send(body);
  const submit = (key: string, assignmentId: string, fileId: string) =>
    post(key, `/assignments/${assignmentId}/submissions`, { fileId });

  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);
  const accepted = () => events.filter((e) => e.type === 'submission.accepted.v1');

  const makeAssignment = async (
    opts: { dueAt?: Date; allowLate?: boolean; periodId?: string } = {},
  ) =>
    (
      await prisma.assignment.create({
        data: {
          courseSectionId: cs3AMath,
          periodId: opts.periodId ?? period4Of2026,
          title: `${TITLE_PREFIX}Tarea`,
          instructions: 'Subir en PDF',
          dueAt: opts.dueAt ?? new Date(Date.now() + 24 * HOUR),
          allowLate: opts.allowLate ?? false,
          createdById: ids.get('docente01')!,
        },
      })
    ).id;

  /** StoredFile de entrega. Por defecto CLEAN, del estudiante01 y confirmado ahora (D-006). */
  const makeFile = async (
    assignmentId: string,
    opts: {
      uploader?: string;
      clean?: boolean;
      purpose?: 'SUBMISSION' | 'MATERIAL';
      completedAt?: Date;
    } = {},
  ) => {
    const clean = opts.clean ?? true;
    const purpose = opts.purpose ?? 'SUBMISSION';
    const file = await prisma.storedFile.create({
      data: {
        objectKey: `${KEY_PREFIX}${randomUUID()}`,
        purpose,
        courseSectionId: cs3AMath,
        assignmentId: purpose === 'SUBMISSION' ? assignmentId : null,
        uploadedById: ids.get(opts.uploader ?? 'estudiante01')!,
        originalName: 'Tarea de Estudiante Ficticio.pdf',
        maxBytes: 20971520,
        intentExpiresAt: new Date(Date.now() + 300_000),
        ...(clean
          ? {
              uploadStatus: 'COMPLETED',
              scanStatus: 'CLEAN',
              sizeBytes: 4096,
              sha256: createHash('sha256').update(randomUUID()).digest('hex'),
              completedAt: opts.completedAt ?? new Date(),
              scannedAt: new Date(),
            }
          : {}),
      },
    });
    return file.id;
  };

  const cleanQaData = async () => {
    const assignments = await prisma.assignment.findMany({
      where: { title: { startsWith: TITLE_PREFIX } },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);
    const where = { submission: { assignmentId: { in: assignmentIds } } };
    if ((await prisma.submissionVersion.count({ where })) > 0) {
      await withoutSubmissionVersionTrigger(ddl, () =>
        prisma.submissionVersion.deleteMany({ where }),
      );
    }
    await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.storedFile.deleteMany({ where: { objectKey: { startsWith: KEY_PREFIX } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    ddl = new PrismaClient({
      adapter: new PrismaMariaDb(process.env.DATABASE_URL!, { useTextProtocol: true }),
    });
    await ensureSubmissionVersionTrigger(ddl);

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const periodOf = async (sequence: number) =>
      (
        await prisma.academicPeriod.findFirstOrThrow({
          where: { academicYearId: y2026.id, sequence },
        })
      ).id;
    period3Of2026 = await periodOf(3);
    period4Of2026 = await periodOf(4);
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Matemática' },
        section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
      },
    });
    cs3AMath = cs.id;

    for (const key of [
      'admin',
      'docente01',
      'docente02',
      'estudiante01',
      'estudiante02',
      'estudiante03',
      'apoderado01',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    await cleanQaData();

    enrollment01In3A = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante01'), sectionId: cs.sectionId, isCurrent: true },
      })
    ).id;

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    events = [];
    unsubscribe = app
      .get(ContentsEventPublisher)
      .on('submission.accepted.v1', (e) => void events.push(e as ContentsEvent));
    const sessions = app.get(SessionService);
    for (const key of ids.keys()) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.get(key) } });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      unsubscribe();
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: null },
      });
      await cleanQaData();
      await ensureSubmissionVersionTrigger(ddl);
    } finally {
      await app?.close();
      await prisma.$disconnect();
      await ddl.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
    events.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Autenticación y roles', () => {
    it('401 sin sesión en las 4 rutas', async () => {
      const id = randomUUID();
      await http().post(`${API}/assignments/${id}/submissions`).send({ fileId: id }).expect(401);
      await http().get(`${API}/assignments/${id}/submissions/me`).expect(401);
      await http().get(`${API}/assignments/${id}/submissions`).expect(401);
      await http().get(`${API}/submissions/${id}/versions`).expect(401);
    });

    it('el apoderado recibe 403 en todas las rutas', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      const { body } = await submit('estudiante01', assignmentId, fileId).expect(201);
      await submit('apoderado01', assignmentId, fileId).expect(403);
      await get('apoderado01', `/assignments/${assignmentId}/submissions/me`).expect(403);
      await get('apoderado01', `/assignments/${assignmentId}/submissions`).expect(403);
      await get('apoderado01', `/submissions/${body.submissionId}/versions`).expect(403);
    });

    it('docente y ADMIN no entregan (403); 400 con cuerpo inválido; 404 con tarea inexistente', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      await submit('docente01', assignmentId, fileId).expect(403);
      await submit('admin', assignmentId, fileId).expect(403);
      await post('estudiante01', `/assignments/${assignmentId}/submissions`, {
        fileId,
        isLate: false,
      }).expect(400);
      await submit('estudiante01', assignmentId, 'no-es-uuid').expect(400);
      await submit('estudiante01', randomUUID(), fileId).expect(404);
    });

    it('RN-12/RN-14: estudiante03 (trasladado de 3A a 3B) no entrega ni consulta en 3A', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId, { uploader: 'estudiante03' });
      await submit('estudiante03', assignmentId, fileId).expect(403);
      await get('estudiante03', `/assignments/${assignmentId}/submissions/me`).expect(403);
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Estudiante trasladado (RN-12, RN-14)', () => {
    it('ve su historial de la sección vieja, pero no entrega ni consulta su estado ahí', async () => {
      const assignmentId = await makeAssignment();
      const cs = await prisma.courseSection.findUniqueOrThrow({ where: { id: cs3AMath } });
      const old = await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante03'), sectionId: cs.sectionId },
      });
      expect(old.isCurrent).toBeNull();
      const fileId = await makeFile(assignmentId, { uploader: 'estudiante03' });
      const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
      const sub = await prisma.submission.create({
        data: {
          assignmentId,
          enrollmentId: old.id,
          versions: {
            create: { versionNumber: 1, fileId, receivedAt: file.completedAt!, isLate: false },
          },
        },
      });
      const h = await get('estudiante03', `/submissions/${sub.id}/versions`).expect(200);
      expect(h.body.versions).toHaveLength(1);
      await submit(
        'estudiante03',
        assignmentId,
        await makeFile(assignmentId, { uploader: 'estudiante03' }),
      ).expect(403);
      await get('estudiante03', `/assignments/${assignmentId}/submissions/me`).expect(403);
      expect(await prisma.submissionVersion.count({ where: { submissionId: sub.id } })).toBe(1);
      // Otro estudiante no ve ese historial; la lista del docente excluye la matrícula vieja.
      await get('estudiante01', `/submissions/${sub.id}/versions`).expect(403);
      const list = await get('docente01', `/assignments/${assignmentId}/submissions`).expect(200);
      expect(list.body.items.some((i: Json) => i.studentId === ids.get('estudiante03'))).toBe(
        false,
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Entregar y reentregar (RF-33, RF-36, RN-09)', () => {
    it('QA-007: dos versiones antes del plazo; la última es la oficial; bitácora y evento', async () => {
      const assignmentId = await makeAssignment();
      const first = await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(
        201,
      );
      expect(first.body).toMatchObject({ versionNumber: 1, isLate: false });
      const second = await submit(
        'estudiante01',
        assignmentId,
        await makeFile(assignmentId),
      ).expect(201);
      expect(second.body).toMatchObject({
        submissionId: first.body.submissionId,
        versionNumber: 2,
        isLate: false,
      });

      const me = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`).expect(
        200,
      );
      expect(me.body).toMatchObject({
        submissionId: first.body.submissionId,
        displayStatus: 'SUBMITTED',
        isLate: false,
      });
      expect(me.body.versions.map((v: Json) => [v.versionNumber, v.isOfficial])).toEqual([
        [2, true],
        [1, false],
      ]);
      expect(me.body.latestVersion.versionId).toBe(second.body.versionId);

      const audits = auditOf('submissions.version.created');
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({
        module: 'submissions',
        entityType: 'Submission',
        entityId: first.body.submissionId,
        actorId: ids.get('estudiante01'),
      });
      expect(JSON.stringify(audits)).not.toContain('Ficticio');
      expect(accepted()).toHaveLength(2);
      expect(accepted()[1].payload).toEqual({
        assignmentId,
        courseSectionId: cs3AMath,
        enrollmentId: enrollment01In3A,
        submissionId: first.body.submissionId,
        versionId: second.body.versionId,
        versionNumber: 2,
        receivedAt: second.body.receivedAt,
        isLate: false,
      });
      expect(JSON.stringify(events)).not.toContain('Ficticio');
    });

    it('idempotencia: el mismo fileId devuelve 200 con la misma versión, sin bitácora ni evento', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      const first = await submit('estudiante01', assignmentId, fileId).expect(201);
      sink.records.length = 0;
      events.length = 0;
      const again = await submit('estudiante01', assignmentId, fileId).expect(200);
      expect(again.body).toEqual(first.body);
      expect(auditOf('submissions.version.created')).toHaveLength(0);
      expect(events).toHaveLength(0);
      expect(await prisma.submissionVersion.count({ where: { fileId } })).toBe(1);
    });

    it('concurrencia: 5 archivos a la vez dan versiones 1..5 sin huecos', async () => {
      const assignmentId = await makeAssignment();
      const files = await Promise.all([1, 2, 3, 4, 5].map(() => makeFile(assignmentId)));
      const results = await Promise.all(files.map((f) => submit('estudiante01', assignmentId, f)));
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      const numbers = results.map((r) => r.body.versionNumber as number).sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(results.map((r) => r.body.submissionId)).size).toBe(1);
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(1);
    });

    it('concurrencia: el mismo archivo 3 veces a la vez crea una sola versión (201 + 200 + 200)', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      const results = await Promise.all(
        [1, 2, 3].map(() => submit('estudiante01', assignmentId, fileId)),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 200, 201]);
      expect(new Set(results.map((r) => r.body.versionId)).size).toBe(1);
      expect(await prisma.submissionVersion.count({ where: { fileId } })).toBe(1);
    });

    it('422: archivo de otro estudiante, de otra tarea, sin escanear o de otro propósito', async () => {
      const assignmentId = await makeAssignment();
      const otherAssignment = await makeAssignment();
      for (const fileId of [
        await makeFile(assignmentId, { uploader: 'estudiante02' }),
        await makeFile(otherAssignment),
        await makeFile(assignmentId, { clean: false }),
        await makeFile(assignmentId, { purpose: 'MATERIAL' }),
        randomUUID(),
      ]) {
        await submit('estudiante01', assignmentId, fileId).expect(422);
      }
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);
    });

    it('422: archivo INFECTED, INVALID o con escaneo PENDING; nada se crea', async () => {
      const assignmentId = await makeAssignment();
      const mk = async (data: Record<string, unknown>) => {
        const id = await makeFile(assignmentId);
        await prisma.storedFile.update({ where: { id }, data });
        return id;
      };
      for (const fileId of [
        await mk({ scanStatus: 'INFECTED' }),
        await mk({ scanStatus: 'PENDING' }),
        await mk({ scanStatus: 'INVALID', rejectReason: 'NOT_PDF' }),
      ]) {
        await submit('estudiante01', assignmentId, fileId).expect(422);
      }
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);
      expect(auditOf('submissions.version.created')).toHaveLength(0);
      expect(accepted()).toHaveLength(0);
    });

    it('409: un archivo ya entregado no se usa en otra tarea', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      await submit('estudiante01', assignmentId, fileId).expect(201);
      const other = await makeAssignment();
      await submit('estudiante01', other, fileId).expect(409);
    });

    it('422 genérico (sin oráculo): el archivo ya entregado por otro alumno', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      await submit('estudiante01', assignmentId, fileId).expect(201);
      const res = await submit('estudiante02', assignmentId, fileId).expect(422);
      expect(res.body.error.message).toBe('El archivo no es válido para esta entrega');
      expect(await prisma.submissionVersion.count({ where: { fileId } })).toBe(1);
    });

    it('RN-10: período cerrado → 409; tarea borrada → 404', async () => {
      const inP3 = await makeAssignment({ periodId: period3Of2026 });
      const fileId = await makeFile(inP3);
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: new Date() },
      });
      try {
        await submit('estudiante01', inP3, fileId).expect(409);
      } finally {
        await prisma.academicPeriod.update({
          where: { id: period3Of2026 },
          data: { closedAt: null },
        });
      }
      const deleted = await makeAssignment();
      const f2 = await makeFile(deleted);
      await prisma.assignment.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
      await submit('estudiante01', deleted, f2).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Tardías (RF-37, RN-06, D-006)', () => {
    it('QA-008: con tardías permitidas se acepta, marcada y con el atraso informado', async () => {
      const assignmentId = await makeAssignment({
        dueAt: new Date(Date.now() - 2 * HOUR),
        allowLate: true,
      });
      const res = await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(
        201,
      );
      expect(res.body.isLate).toBe(true);
      expect(res.body.receipt.status).toBe('SUBMITTED_LATE');
      expect(res.body.receipt.lateBySeconds).toBeGreaterThanOrEqual(2 * 3600 - 5);
      const me = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`).expect(
        200,
      );
      expect(me.body.displayStatus).toBe('SUBMITTED_LATE');
      expect(accepted()[0].payload.isLate).toBe(true);
    });

    it('QA-009: sin tardías permitidas se bloquea después del plazo (409) y nada se crea', async () => {
      const assignmentId = await makeAssignment({ dueAt: new Date(Date.now() - HOUR) });
      await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(409);
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);
      expect(auditOf('submissions.version.created')).toHaveLength(0);
      const me = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`).expect(
        200,
      );
      expect(me.body).toMatchObject({ displayStatus: 'PENDING', isOverdue: true, versions: [] });
    });

    it('QA-009: exactamente en dueAt es a tiempo; dueAt + 1 ms es tarde y se bloquea sin allowLate', async () => {
      const dueAt = new Date(Date.now() - HOUR);
      const assignmentId = await makeAssignment({ dueAt });
      const onTime = await submit(
        'estudiante01',
        assignmentId,
        await makeFile(assignmentId, { completedAt: dueAt }),
      ).expect(201);
      expect(onTime.body).toMatchObject({ isLate: false, receipt: { lateBySeconds: 0 } });

      const strict = await makeAssignment({ dueAt });
      await submit(
        'estudiante01',
        strict,
        await makeFile(strict, { completedAt: new Date(dueAt.getTime() + 1) }),
      ).expect(409);
      expect(await prisma.submission.count({ where: { assignmentId: strict } })).toBe(0);
    });

    it('QA-008: dueAt + 1 ms con allowLate se acepta marcada tarde con lateBySeconds 0', async () => {
      const dueAt = new Date(Date.now() - HOUR);
      const assignmentId = await makeAssignment({ dueAt, allowLate: true });
      const res = await submit(
        'estudiante01',
        assignmentId,
        await makeFile(assignmentId, { completedAt: new Date(dueAt.getTime() + 1) }),
      ).expect(201);
      expect(res.body.isLate).toBe(true);
      expect(res.body.receipt).toMatchObject({ status: 'SUBMITTED_LATE', lateBySeconds: 0 });
    });

    it('reentrega tras el plazo: con allowLate v2 tarde y oficial; sin allowLate se bloquea y v1 se conserva', async () => {
      const dueAt = new Date(Date.now() - HOUR);
      const early = new Date(dueAt.getTime() - 60_000);
      const assignmentId = await makeAssignment({ dueAt, allowLate: true });
      const v1 = await submit(
        'estudiante01',
        assignmentId,
        await makeFile(assignmentId, { completedAt: early }),
      ).expect(201);
      expect(v1.body.isLate).toBe(false);
      const v2 = await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(
        201,
      );
      expect(v2.body).toMatchObject({ versionNumber: 2, isLate: true });
      const me = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`).expect(
        200,
      );
      expect(me.body).toMatchObject({ displayStatus: 'SUBMITTED_LATE', isLate: true });
      expect(me.body.versions.map((v: Json) => [v.versionNumber, v.isLate, v.isOfficial])).toEqual([
        [2, true, true],
        [1, false, false],
      ]);

      const strict = await makeAssignment({ dueAt });
      const s1 = await submit(
        'estudiante01',
        strict,
        await makeFile(strict, { completedAt: early }),
      ).expect(201);
      await submit('estudiante01', strict, await makeFile(strict)).expect(409);
      const h = await get('estudiante01', `/submissions/${s1.body.submissionId}/versions`).expect(
        200,
      );
      expect(h.body.versions).toHaveLength(1);
    });

    it('D-006: la hora de entrega es completedAt; subida confirmada antes del plazo es a tiempo', async () => {
      const dueAt = new Date(Date.now() - HOUR);
      const completedAt = new Date(dueAt.getTime() - 60_000);
      const assignmentId = await makeAssignment({ dueAt });
      const res = await submit(
        'estudiante01',
        assignmentId,
        await makeFile(assignmentId, { completedAt }),
      ).expect(201);
      expect(res.body).toMatchObject({ isLate: false, receivedAt: completedAt.toISOString() });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Constancia, historial y lista del docente (RF-38, RF-39)', () => {
    it('QA-010: la constancia trae fecha y hora, archivo, estado y referencia', async () => {
      const assignmentId = await makeAssignment();
      const fileId = await makeFile(assignmentId);
      const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
      const res = await submit('estudiante01', assignmentId, fileId).expect(201);
      expect(res.body.receipt).toEqual({
        reference: res.body.versionId,
        submissionId: res.body.submissionId,
        assignmentId,
        versionId: res.body.versionId,
        versionNumber: 1,
        receivedAt: file.completedAt!.toISOString(),
        isLate: false,
        lateBySeconds: 0,
        isOfficial: true,
        status: 'SUBMITTED',
        file: {
          fileId,
          originalName: file.originalName,
          sizeBytes: 4096,
          sha256: file.sha256,
        },
      });

      // Historial: dueño, docente asignado y ADMIN sí; otro estudiante y docente ajeno no.
      const url = `/submissions/${res.body.submissionId}/versions`;
      for (const key of ['estudiante01', 'docente01', 'admin']) {
        const h = await get(key, url).expect(200);
        expect(h.body).toMatchObject({
          submissionId: res.body.submissionId,
          assignmentId,
          enrollmentId: enrollment01In3A,
        });
        expect(h.body.versions[0]).toEqual(res.body.receipt);
      }
      await get('estudiante02', url).expect(403);
      await get('docente02', url).expect(403);
      await get('admin', `/submissions/${randomUUID()}/versions`).expect(404);
    });

    it('lista del docente: una fila por matrícula vigente; solo docente asignado y ADMIN', async () => {
      const assignmentId = await makeAssignment();
      await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(201);
      await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(201);

      const res = await get('docente01', `/assignments/${assignmentId}/submissions`).expect(200);
      expect(res.body.total).toBe(res.body.items.length);
      const mine = res.body.items.find((i: Json) => i.studentId === ids.get('estudiante01'));
      expect(mine).toMatchObject({
        enrollmentId: enrollment01In3A,
        versionCount: 2,
        displayStatus: 'SUBMITTED',
        latestVersion: { versionNumber: 2, isLate: false },
      });
      expect(typeof mine.fullName).toBe('string');
      const other = res.body.items.find((i: Json) => i.studentId === ids.get('estudiante02'));
      expect(other).toMatchObject({
        submissionId: null,
        latestVersion: null,
        versionCount: 0,
        displayStatus: 'PENDING',
      });
      expect(res.body.items.some((i: Json) => i.studentId === ids.get('estudiante03'))).toBe(false);

      await get('admin', `/assignments/${assignmentId}/submissions`).expect(200);
      await get('docente02', `/assignments/${assignmentId}/submissions`).expect(403);
      await get('estudiante01', `/assignments/${assignmentId}/submissions`).expect(403);
    });

    it('docente ajeno: 403 en lista e historial; /me no es de docentes', async () => {
      const assignmentId = await makeAssignment();
      const res = await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(
        201,
      );
      await get('docente02', `/assignments/${assignmentId}/submissions`).expect(403);
      await get('docente02', `/submissions/${res.body.submissionId}/versions`).expect(403);
      await get('docente01', `/assignments/${assignmentId}/submissions/me`).expect(403);
      await get('docente02', `/assignments/${assignmentId}/submissions/me`).expect(403);
    });

    it('lista del docente: matrículas sin entrega son PENDING aunque haya vencido; sin datos de archivo', async () => {
      const assignmentId = await makeAssignment({ dueAt: new Date(Date.now() - HOUR) });
      const res = await get('docente01', `/assignments/${assignmentId}/submissions`).expect(200);
      expect(res.body.items.length).toBeGreaterThan(1);
      for (const item of res.body.items as Json[]) {
        expect(item).toMatchObject({
          submissionId: null,
          latestVersion: null,
          versionCount: 0,
          displayStatus: 'PENDING',
        });
      }
      expect(JSON.stringify(res.body)).not.toContain('originalName');
    });

    it('privacidad: bitácora y evento solo llevan ids y metadatos, sin nombres ni originalName', async () => {
      const assignmentId = await makeAssignment();
      await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(201);
      expect(auditOf('submissions.version.created')).toHaveLength(1);
      expect(accepted()).toHaveLength(1);
      const dump = JSON.stringify([sink.records, events]);
      for (const forbidden of ['originalName', 'Ficticio', '.pdf', 'sha256', 'fullName']) {
        expect(dump).not.toContain(forbidden);
      }
    });

    it('SubmissionsReadService (contrato de Dev 4)', async () => {
      const assignmentId = await makeAssignment();
      const second = await (async () => {
        await submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(201);
        return submit('estudiante01', assignmentId, await makeFile(assignmentId)).expect(201);
      })();
      const read = app.get(SubmissionsReadService);
      expect(await read.getAssignmentForGrading(assignmentId)).toMatchObject({
        id: assignmentId,
        courseSectionId: cs3AMath,
        noSubmissionGrade: '0.00',
        allowLate: false,
      });
      expect(await read.listSubmissionSummaries(assignmentId)).toEqual([
        {
          enrollmentId: enrollment01In3A,
          submissionId: second.body.submissionId,
          versionCount: 2,
          latestVersion: {
            versionId: second.body.versionId,
            versionNumber: 2,
            receivedAt: second.body.receivedAt,
            isLate: false,
            fileId: second.body.receipt.file.fileId,
          },
        },
      ]);
      await expect(read.getAssignmentForGrading(randomUUID())).rejects.toThrow();
    });
  });
});
