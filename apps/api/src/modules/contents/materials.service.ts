import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { recordContents } from './contents-audit.js';
import { ContentsEventPublisher } from './contents-events.js';
import { assertCanWriteCourseSection, lockOpenPeriod } from './contents-guards.js';
import type { CreateMaterialDto, ListMaterialsQuery, UpdateMaterialDto } from './materials.dto.js';
import {
  canRestore,
  copyrightNoticeFor,
  diffMaterial,
  trashExpiresAt,
  type MaterialKindValue,
} from './materials.policy.js';

// Clase o lectura (RF-26/27). La descarga va por POST /files/:id/download-url (fase 3b):
// aquí solo se devuelve fileId.
export type MaterialView = {
  id: string;
  courseSectionId: string;
  periodId: string | null;
  kind: MaterialKindValue;
  title: string;
  description: string | null;
  fileId: string;
  isReusable: boolean;
  /** RF-27: aviso fijo para READING; null para CLASS. */
  copyrightNotice: string | null;
  /** Papelera (RF-30): solo aparecen con includeDeleted=true (docente asignado o ADMIN). */
  deletedAt: string | null;
  /** Hasta cuándo se puede restaurar (deletedAt + 30 días); null si no está borrado. */
  restorableUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MATERIAL_MSG = {
  notFound: 'El material no existe',
  invalidFile: 'El archivo no es válido para este material',
  fileInUse: 'El archivo ya está publicado en otro material',
  notDeleted: 'El material no está en la papelera',
  trashExpired: 'Pasaron más de 30 días desde el borrado: el material ya no se puede restaurar',
  filePurged: 'El archivo del material ya fue purgado',
  trashForbidden: 'Solo el docente del curso o un administrador ven la papelera',
} as const;

type MaterialRow = Prisma.MaterialGetPayload<object>;

function toView(m: MaterialRow): MaterialView {
  return {
    id: m.id,
    courseSectionId: m.courseSectionId,
    periodId: m.periodId,
    kind: m.kind,
    title: m.title,
    description: m.description,
    fileId: m.fileId,
    isReusable: m.isReusable,
    copyrightNotice: copyrightNoticeFor(m.kind),
    deletedAt: m.deletedAt?.toISOString() ?? null,
    restorableUntil: m.deletedAt ? trashExpiresAt(m.deletedAt).toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly events: ContentsEventPublisher,
  ) {}

  // RF-26/27: publicar una clase o una lectura (docente asignado o ADMIN; RN-10 si hay período).
  async create(
    courseSectionId: string,
    dto: CreateMaterialDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<MaterialView> {
    await assertCanWriteCourseSection(this.access, user, courseSectionId);
    await this.access.assertCourseSectionWritable(courseSectionId, dto.periodId ?? undefined);

    const created = await this.prisma
      .$transaction(async (tx) => {
        if (dto.periodId !== null) await lockOpenPeriod(tx, dto.periodId);
        await this.assertFileUsable(tx, dto.fileId, courseSectionId);
        const row = await tx.material.create({
          data: {
            courseSectionId,
            periodId: dto.periodId,
            kind: dto.kind,
            title: dto.title,
            description: dto.description,
            fileId: dto.fileId,
            isReusable: dto.isReusable,
            createdById: actor.id,
          },
        });
        await recordContents(
          this.audit,
          actor,
          'material.created',
          'Material',
          row.id,
          {
            after: {
              courseSectionId,
              periodId: row.periodId,
              kind: row.kind,
              fileId: row.fileId,
              isReusable: row.isReusable,
            },
          },
          tx,
        );
        return row;
      })
      .catch((e: unknown) => mapPrismaError(e, MATERIAL_MSG.fileInUse));

    this.events.publish({
      type: 'material.published.v1',
      payload: {
        materialId: created.id,
        courseSectionId,
        periodId: created.periodId,
        kind: created.kind,
        publishedAt: created.createdAt.toISOString(),
      },
    });
    return toView(created);
  }

  // RF-31: lo ven los miembros (el apoderado no: lo corta @Roles). Papelera solo docente/ADMIN.
  async list(
    courseSectionId: string,
    query: ListMaterialsQuery,
    user: AuthenticatedUser,
  ): Promise<{ items: MaterialView[]; total: number }> {
    if (query.includeDeleted) {
      if (user.role === 'STUDENT') throw new ForbiddenException(MATERIAL_MSG.trashForbidden);
      await assertCanWriteCourseSection(this.access, user, courseSectionId);
    } else {
      await this.access.assertCanAccessCourseSection(user, courseSectionId);
    }
    const rows = await this.prisma.material.findMany({
      where: {
        courseSectionId,
        kind: query.kind,
        periodId: query.periodId,
        ...(query.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map(toView), total: rows.length };
  }

  // RF-29: editar título, descripción o la marca de reutilizable (RN-10 si hay período).
  async update(
    id: string,
    dto: UpdateMaterialDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<MaterialView> {
    const current = await this.findOrFail(id);
    if (current.deletedAt !== null) throw new NotFoundException(MATERIAL_MSG.notFound);
    await this.assertWritable(user, current);
    if (dto.isReusable === true && current.kind !== 'READING') {
      throw new UnprocessableEntityException(
        'Solo las lecturas se pueden marcar como reutilizables',
      );
    }

    const change = diffMaterial(current, dto);
    if (change.changedFields.length === 0) return toView(current);

    const updated = await this.prisma
      .$transaction(async (tx) => {
        if (current.periodId !== null) await lockOpenPeriod(tx, current.periodId);
        const { count } = await tx.material.updateMany({
          where: { id, deletedAt: null },
          data: { title: dto.title, description: dto.description, isReusable: dto.isReusable },
        });
        if (count === 0) throw new NotFoundException(MATERIAL_MSG.notFound);
        const row = await tx.material.findUniqueOrThrow({ where: { id } });
        await recordContents(
          this.audit,
          actor,
          'material.updated',
          'Material',
          id,
          {
            before: change.before,
            after: { ...change.after, changedFields: change.changedFields },
          },
          tx,
        );
        return row;
      })
      .catch((e: unknown) => mapPrismaError(e));

    return toView(updated);
  }

  // RF-30: a la papelera (deletedAt y deletedById juntos). La purga del archivo es de Dev 5.
  async remove(id: string, user: AuthenticatedUser, actor: Actor): Promise<void> {
    const current = await this.findOrFail(id);
    if (current.deletedAt !== null) throw new NotFoundException(MATERIAL_MSG.notFound);
    await this.assertWritable(user, current);

    const deletedAt = new Date();
    await this.prisma
      .$transaction(async (tx) => {
        if (current.periodId !== null) await lockOpenPeriod(tx, current.periodId);
        const { count } = await tx.material.updateMany({
          where: { id, deletedAt: null },
          data: { deletedAt, deletedById: actor.id },
        });
        if (count === 0) throw new NotFoundException(MATERIAL_MSG.notFound);
        await recordContents(
          this.audit,
          actor,
          'material.deleted',
          'Material',
          id,
          { before: { deletedAt: null }, after: { deletedAt: deletedAt.toISOString() } },
          tx,
        );
      })
      .catch((e: unknown) => mapPrismaError(e));
  }

  // RF-30: restaurar dentro de los 30 días (409 después o si el archivo ya se purgó).
  async restore(id: string, user: AuthenticatedUser, actor: Actor): Promise<MaterialView> {
    const current = await this.findOrFail(id);
    await this.assertWritable(user, current);
    if (current.deletedAt === null) throw new ConflictException(MATERIAL_MSG.notDeleted);

    const restored = await this.prisma
      .$transaction(async (tx) => {
        if (current.periodId !== null) await lockOpenPeriod(tx, current.periodId);
        const rows = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
          SELECT deletedAt FROM Material WHERE id = ${id} FOR UPDATE`;
        const deletedAt = rows[0]?.deletedAt ?? null;
        if (deletedAt === null) throw new ConflictException(MATERIAL_MSG.notDeleted);
        if (!canRestore(deletedAt, new Date())) {
          throw new ConflictException(MATERIAL_MSG.trashExpired);
        }
        const file = await tx.storedFile.findUnique({
          where: { id: current.fileId },
          select: { purgedAt: true },
        });
        if (!file || file.purgedAt !== null) throw new ConflictException(MATERIAL_MSG.filePurged);
        await tx.material.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
        const row = await tx.material.findUniqueOrThrow({ where: { id } });
        await recordContents(
          this.audit,
          actor,
          'material.restored',
          'Material',
          id,
          { before: { deletedAt: deletedAt.toISOString() }, after: { deletedAt: null } },
          tx,
        );
        return { row, deletedAt };
      })
      .catch((e: unknown) => mapPrismaError(e));
    return toView(restored.row);
  }

  /** Docente asignado o ADMIN, curso-sección escribible y período abierto si lo tiene (RN-10). */
  private async assertWritable(user: AuthenticatedUser, m: MaterialRow): Promise<void> {
    await assertCanWriteCourseSection(this.access, user, m.courseSectionId);
    await this.access.assertCourseSectionWritable(m.courseSectionId, m.periodId ?? undefined);
  }

  /**
   * El archivo debe ser un StoredFile limpio con purpose MATERIAL, del mismo curso-sección,
   * sin purgar y sin otro material (además está el índice único de Material.fileId). 422 con un
   * solo mensaje para no revelar si existe en otro curso; 409 si ya está publicado.
   */
  private async assertFileUsable(
    tx: Prisma.TransactionClient,
    fileId: string,
    courseSectionId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM StoredFile WHERE id = ${fileId} FOR UPDATE`;
    if (locked.length === 0) throw new UnprocessableEntityException(MATERIAL_MSG.invalidFile);
    const file = await tx.storedFile.findUnique({
      where: { id: fileId },
      select: {
        purpose: true,
        courseSectionId: true,
        scanStatus: true,
        purgedAt: true,
        material: { select: { id: true } },
      },
    });
    const usable =
      file !== null &&
      file.purpose === 'MATERIAL' &&
      file.courseSectionId === courseSectionId &&
      file.scanStatus === 'CLEAN' &&
      file.purgedAt === null;
    if (!usable) throw new UnprocessableEntityException(MATERIAL_MSG.invalidFile);
    if (file.material !== null) throw new ConflictException(MATERIAL_MSG.fileInUse);
  }

  private async findOrFail(id: string): Promise<MaterialRow> {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException(MATERIAL_MSG.notFound);
    return material;
  }
}
