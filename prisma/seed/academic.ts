// Seed de la estructura academica y usuarios ficticios (Dev 2, F1). Idempotente:
// upsert por clave natural y matriculas solo si el estudiante no tiene ninguna en ese año.
// No crea LocalCredential ni AuditLog (el seed no es una accion de un usuario).
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  ALL_USERS,
  COURSES,
  ENROLLMENTS,
  GUARDIAN_LINKS,
  SECTIONS,
  YEARS,
  day,
  sectionKey,
  teacherFor,
} from './fixtures.js';

export async function seedAcademic(prisma: PrismaClient): Promise<void> {
  // 1. Usuarios (clave natural: institutionalEmail). Se restablecen nombre, rol y estado.
  const userIds = new Map<string, string>();
  for (const u of ALL_USERS) {
    const data = { fullName: u.fullName, role: u.role, status: u.status };
    const row = await prisma.user.upsert({
      where: { institutionalEmail: u.institutionalEmail },
      create: { institutionalEmail: u.institutionalEmail, ...data },
      update: data,
      select: { id: true },
    });
    userIds.set(u.key, row.id);
  }
  const userId = (key: string): string => {
    const id = userIds.get(key);
    if (!id) throw new Error(`Usuario de seed desconocido: ${key}`);
    return id;
  };

  // 2. Años (clave: year). Primero los inactivos para liberar el marcador TRUE (RN-11).
  //    Inactivo = NULL, nunca FALSE (CHECK AcademicYear_isActive_chk).
  const yearIds = new Map<number, string>();
  const ordered = [...YEARS].sort((a, b) => Number(a.isActive) - Number(b.isActive));
  for (const y of ordered) {
    const data = {
      isActive: y.isActive ? true : null,
      closedAt: y.closedAt ? day(y.closedAt) : null,
    };
    const row = await prisma.academicYear.upsert({
      where: { year: y.year },
      create: { year: y.year, ...data },
      update: data,
      select: { id: true },
    });
    yearIds.set(y.year, row.id);

    // 3. Periodos (clave: academicYearId + sequence). sequence y kind coinciden (CHECK).
    for (const p of y.periods) {
      const periodData = {
        kind: p.kind,
        label: p.label,
        startDate: day(p.startDate),
        endDate: day(p.endDate),
        closedAt: p.closedAt ? day(p.closedAt) : null,
      };
      await prisma.academicPeriod.upsert({
        where: { academicYearId_sequence: { academicYearId: row.id, sequence: p.sequence } },
        create: { academicYearId: row.id, sequence: p.sequence, ...periodData },
        update: periodData,
      });
    }
  }
  const yearId = (year: number): string => {
    const id = yearIds.get(year);
    if (!id) throw new Error(`Año de seed desconocido: ${year}`);
    return id;
  };

  // 4. Secciones (clave: academicYearId + gradeLevel + code).
  const sectionIds = new Map<string, { id: string; academicYearId: string }>();
  for (const s of SECTIONS) {
    const academicYearId = yearId(s.year);
    const row = await prisma.section.upsert({
      where: {
        academicYearId_gradeLevel_code: { academicYearId, gradeLevel: s.gradeLevel, code: s.code },
      },
      create: { academicYearId, gradeLevel: s.gradeLevel, code: s.code },
      update: { isActive: true },
      select: { id: true, academicYearId: true },
    });
    sectionIds.set(sectionKey(s), row);
  }
  const section = (key: string): { id: string; academicYearId: string } => {
    const s = sectionIds.get(key);
    if (!s) throw new Error(`Seccion de seed desconocida: ${key}`);
    return s;
  };

  // 5. Cursos (clave: name).
  const courseIds = new Map<string, string>();
  for (const name of COURSES) {
    const row = await prisma.course.upsert({
      where: { name },
      create: { name },
      update: { isActive: true },
      select: { id: true },
    });
    courseIds.set(name, row.id);
  }

  // 6. CourseSection: los 5 cursos en cada seccion del año activo (clave: sectionId + courseId).
  const activeYear = YEARS.find((y) => y.isActive);
  if (!activeYear) throw new Error('El seed necesita un año activo');
  for (const s of SECTIONS.filter((x) => x.year === activeYear.year)) {
    const sectionId = section(sectionKey(s)).id;
    for (const course of COURSES) {
      const courseId = courseIds.get(course)!;
      const teacherId = userId(teacherFor(course, s));
      await prisma.courseSection.upsert({
        where: { sectionId_courseId: { sectionId, courseId } },
        create: { sectionId, courseId, teacherId },
        update: { teacherId, isActive: true },
      });
    }
  }

  // 7. Matriculas: solo si el estudiante no tiene ninguna en ese año (asi no se duplica
  //    el historial de traslados ni de retiros). Cada historial va en una transaccion.
  for (const e of ENROLLMENTS) {
    const studentId = userId(e.student);
    const academicYearId = yearId(e.year);
    const existing = await prisma.enrollment.count({ where: { studentId, academicYearId } });
    if (existing > 0) continue;

    await prisma.$transaction(
      e.steps.map((step) => {
        const target = section(step.section);
        if (target.academicYearId !== academicYearId) {
          throw new Error(`La seccion ${step.section} no es del año ${e.year}`);
        }
        const closed = step.endReason !== undefined;
        return prisma.enrollment.create({
          data: {
            studentId,
            sectionId: target.id,
            academicYearId,
            // Vigente = TRUE; cerrada = NULL + effectiveTo + endReason (CHECK Enrollment_isCurrent_chk).
            isCurrent: closed ? null : true,
            effectiveFrom: day(step.effectiveFrom),
            effectiveTo: step.effectiveTo ? day(step.effectiveTo) : null,
            endReason: step.endReason ?? null,
          },
        });
      }),
    );
  }

  // 8. Vinculos apoderado–estudiante: solo se crea si el par no tiene uno vigente (isActive TRUE).
  //    Los revocados (isActive NULL + revokedAt) se conservan y no se reactivan (RN-13/14).
  for (const link of GUARDIAN_LINKS) {
    const guardianId = userId(link.guardian);
    const studentId = userId(link.student);
    const current = await prisma.guardianStudent.findFirst({
      where: { guardianId, studentId, isActive: true },
      select: { id: true },
    });
    if (!current) await prisma.guardianStudent.create({ data: { guardianId, studentId } });
  }
}
